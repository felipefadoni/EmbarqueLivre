/**
 * Offline-first (regra do Felipe): cadastro válido que ainda não chegou à API NUNCA é Pendência nem "Corrigir"; fica
 * guardado e é reenviado sozinho. Pendência = só recusa real da API para aquela operação (dado que o usuário precisa
 * mudar).
 *
 * Este módulo:
 * - separa recusa real (Corrigir/Descartar) de falha de envio;
 * - "devolve para o envio" o que versões anteriores gravaram em `sync_rejections` por engano (rede, 5xx, 401, lote
 *   inteiro recusado por rota/proxy 404/405/403/413, SYNC_NO_RESULT…) e, junto, as recusas *_NOT_FOUND que só
 *   aconteceram porque o "pai" (fazenda, rebanho…) não tinha chegado, ou qualquer 403/404 por operação. PUT volta para a
 *   própria tabela (reaparece no app e entra de novo no `ps_crud`, o que impede o checkpoint de apagá-lo); PATCH/DELETE
 *   vão para a saída local `sync_outbox`, enviada pelo connector ANTES da fila, na ordem original.
 *
 * Puro (sem React Native): recebe o executor SQL, testável no Node.
 */
import { columnList, entityOfTable, OUTBOX_TABLE, REJECTIONS_TABLE, SYNC_TABLES, type SyncEntity } from './mapping'
import { isDefinitiveRejectionStatus, uploadTransaction, type PostBatch, type RejectionRecord } from './upload'

const O = OUTBOX_TABLE.table
const OC = OUTBOX_TABLE.columns
const R = REJECTIONS_TABLE.table
const RC = REJECTIONS_TABLE.columns

export type OutboxExecutor = {
  execute(sql: string, params?: unknown[]): Promise<unknown>
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
}

export type OutboxRow = { id: string; tableName: string; rowId: string; op: string; opData: string | null; createdAt: string }

export const OUTBOX_COUNT_SQL = `SELECT COUNT(*) AS n FROM ${O}`

/** Códigos genéricos que só aparecem quando o LOTE falhou (rota, proxy, rede, bug) — nunca recusa de um cadastro. */
const ENVELOPE_CODES = new Set([
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'INVALID_BATCH',
  'BATCH_TOO_LARGE',
  'PAYLOAD_TOO_LARGE',
  'SYNC_NO_RESULT',
  'SYNC_UNAVAILABLE',
  'NETWORK_ERROR',
  'TIMEOUT',
  'UNAUTHENTICATED',
])

type RejectionLike = { statusCode: number | null; errorCode: string | null }

/** Falha de envio gravada como Pendência por engano (o servidor não recusou o DADO). */
export function isDeliveryFailure(rejection: RejectionLike): boolean {
  const status = Number(rejection.statusCode ?? 0)
  const code = String(rejection.errorCode ?? '')
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return true
  return ENVELOPE_CODES.has(code) || /^HTTP_/.test(code)
}

/** Recusa real que o usuário resolve editando o cadastro (validação, duplicado, regra de negócio). */
export function isFixableRejection(rejection: RejectionLike): boolean {
  if (isDeliveryFailure(rejection)) return false
  return isDefinitiveRejectionStatus(Number(rejection.statusCode ?? 0))
}

const isNotFoundCode = (code: string | null) => /(^|_)NOT_FOUND$/.test(String(code ?? ''))

type StoredRejection = RejectionLike & { id: string; tableName: string; rowId: string; op: string; opData: string | null; createdAt: string }

const SELECT_REJECTIONS = `SELECT id, ${RC.tableName.name} AS tableName, ${RC.rowId.name} AS rowId, ${RC.op.name} AS op,
  ${RC.opData.name} AS opData, ${RC.statusCode.name} AS statusCode, ${RC.errorCode.name} AS errorCode, ${RC.createdAt.name} AS createdAt
  FROM ${R} ORDER BY ${RC.createdAt.name}, id`

function referencedIds(opData: string | null): Set<string> {
  const out = new Set<string>()
  if (!opData) return out
  try {
    const data = JSON.parse(opData) as Record<string, unknown>
    for (const value of Object.values(data ?? {})) if (typeof value === 'string' && value) out.add(value.toUpperCase())
  } catch {
    // opData inválido: sem referências
  }
  return out
}

/** Colunas sincronizadas da tabela (sem `id`); null = tabela que não é do PowerSync. */
function syncedTable(tableName: string): { table: string; columns: string[] } | null {
  const entity = entityOfTable(tableName)
  if (!entity || !(entity in SYNC_TABLES)) return null
  return { table: SYNC_TABLES[entity as SyncEntity].table, columns: columnList(entity as SyncEntity).map(([name]) => name) }
}

/**
 * Devolve um PUT recusado à tabela do PowerSync: a linha volta a aparecer no app e a operação volta para a fila
 * (`ps_crud`) — que também impede o checkpoint de apagá-la de novo. false = não deu (vai para a saída `sync_outbox`).
 */
async function restorePut(db: OutboxExecutor, row: StoredRejection): Promise<boolean> {
  if (String(row.op).toUpperCase() !== 'PUT' || !row.opData) return false
  const target = syncedTable(row.tableName)
  if (!target) return false
  const { table, columns } = target
  let data: Record<string, unknown>
  try {
    data = JSON.parse(row.opData) as Record<string, unknown>
  } catch {
    return false
  }
  const keys = columns.filter((name) => name in (data ?? {}))
  const values = keys.map((name) => {
    const value = data[name]
    return value === undefined ? null : typeof value === 'object' && value !== null ? JSON.stringify(value) : value
  })
  const exists = await db.getOptional<{ id: string }>(`SELECT id FROM ${table} WHERE upper(id) = upper(?)`, [row.rowId])
  if (exists) {
    if (keys.length) await db.execute(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...values, exists.id])
  } else {
    await db.execute(`INSERT INTO ${table} (id${keys.map((k) => `, ${k}`).join('')}) VALUES (?${keys.map(() => ', ?').join('')})`, [row.rowId, ...values])
  }
  return true
}

let requeueRunning: Promise<number> | null = null

/**
 * Tira de Pendências tudo que NÃO é recusa corrigível (400/409/422): falhas de envio gravadas por engano (rede, 5xx,
 * 401, lote recusado por rota/proxy…) e recusas 403/404/… por referência (FARM_NOT_FOUND, ANIMAL_TYPE_NOT_FOUND,
 * ANIMAL_NOT_FOUND…). PUT volta para a tabela do PowerSync (reaparece no app e entra na fila); PATCH/DELETE vão para a
 * saída `sync_outbox`. Idempotente e uma execução por vez; devolve quantas devolveu ao envio.
 */
export function requeueDeliveryFailures(db: OutboxExecutor, newId: () => string): Promise<number> {
  if (!requeueRunning) {
    requeueRunning = requeueOnce(db, newId).finally(() => {
      requeueRunning = null
    })
  }
  return requeueRunning
}

async function requeueOnce(db: OutboxExecutor, newId: () => string): Promise<number> {
  const rows = await db.getAll<StoredRejection>(SELECT_REJECTIONS)
  if (!rows.length) return 0
  const requeue = new Map<string, StoredRejection>()
  for (const row of rows) if (!isFixableRejection(row)) requeue.set(row.id, row)
  // Dependentes (animal → fazenda, vínculo → embarque…): recusados só porque o pai não tinha chegado.
  let changed = requeue.size > 0
  while (changed) {
    changed = false
    const parents = new Set([...requeue.values()].map((row) => String(row.rowId).toUpperCase()))
    for (const row of rows) {
      if (requeue.has(row.id) || !isNotFoundCode(row.errorCode)) continue
      if ([...referencedIds(row.opData)].some((id) => parents.has(id))) {
        requeue.set(row.id, row)
        changed = true
      }
    }
  }
  const ordered = rows.filter((row) => requeue.has(row.id))
  let restored = 0
  for (const row of ordered) {
    if (await restorePut(db, row).catch((error) => (console.warn('[sync] não deu para devolver o cadastro à tabela', error), false))) {
      await db.execute(`DELETE FROM ${R} WHERE id = ?`, [row.id])
      restored++
      continue
    }
    await db.execute(`DELETE FROM ${O} WHERE ${OC.tableName.name} = ? AND upper(${OC.rowId.name}) = upper(?) AND ${OC.op.name} = ?`, [
      row.tableName,
      row.rowId,
      row.op,
    ])
    await db.execute(
      `INSERT INTO ${O} (id, ${OC.tableName.name}, ${OC.rowId.name}, ${OC.op.name}, ${OC.opData.name}, ${OC.attempts.name}, ${OC.lastError.name}, ${OC.createdAt.name})
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`,
      [newId(), row.tableName, row.rowId, row.op, row.opData, row.createdAt],
    )
    await db.execute(`DELETE FROM ${R} WHERE id = ?`, [row.id])
  }
  if (ordered.length) {
    console.log(`[sync] ${ordered.length} operação(ões) que não eram recusa corrigível voltaram para o envio automático (${restored} cadastro(s) restaurado(s) no app)`)
  }
  return ordered.length
}

export async function nextOutboxEntry(db: OutboxExecutor): Promise<OutboxRow | null> {
  return db.getOptional<OutboxRow>(
    `SELECT id, ${OC.tableName.name} AS tableName, ${OC.rowId.name} AS rowId, ${OC.op.name} AS op, ${OC.opData.name} AS opData,
       ${OC.createdAt.name} AS createdAt FROM ${O} ORDER BY ${OC.createdAt.name}, id LIMIT 1`,
  )
}

/**
 * Envia a saída de reenvio (uma op por vez, na ordem). Mesmas regras do upload: recusa real → Pendência e sai da
 * saída; falha temporária / lote bloqueado / 401 → lança e a op fica (a fila do PowerSync espera, mantendo a ordem).
 */
export async function flushOutbox(
  db: OutboxExecutor,
  deps: { post: PostBatch; saveRejections: (rows: RejectionRecord[]) => Promise<void>; ensurePhotos?: (photoIds: string[]) => Promise<unknown> },
): Promise<number> {
  let sent = 0
  for (let guard = 0; guard < 1000; guard++) {
    const entry = await nextOutboxEntry(db)
    if (!entry) return sent
    let opData: Record<string, unknown> | undefined
    try {
      opData = entry.opData ? (JSON.parse(entry.opData) as Record<string, unknown>) : undefined
    } catch {
      opData = undefined
    }
    try {
      await uploadTransaction(
        {
          crud: [{ id: entry.rowId, op: entry.op, table: entry.tableName, opData }],
          complete: async () => void (await db.execute(`DELETE FROM ${O} WHERE id = ?`, [entry.id])),
        },
        deps,
      )
    } catch (error) {
      await db
        .execute(`UPDATE ${O} SET ${OC.attempts.name} = COALESCE(${OC.attempts.name}, 0) + 1, ${OC.lastError.name} = ? WHERE id = ?`, [
          String((error as Error)?.message ?? error),
          entry.id,
        ])
        .catch(() => undefined)
      throw error
    }
    sent++
  }
  return sent
}

/** Chave da próxima coisa a enviar (saída de reenvio primeiro, depois a fila do PowerSync); null = nada. */
export async function nextUploadKey(
  db: OutboxExecutor & { getNextCrudTransaction(): Promise<{ transactionId?: number; crud: { clientId?: number }[] } | null> },
): Promise<string | number | null> {
  const parked = await nextOutboxEntry(db).catch(() => null)
  if (parked) return `outbox:${parked.id}`
  const transaction = await db.getNextCrudTransaction()
  return transaction ? (transaction.transactionId ?? transaction.crud[0]?.clientId ?? 0) : null
}
