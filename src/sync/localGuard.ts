/**
 * Política do Felipe (11/11): o que está no aparelho vale mais que o que está online.
 * - Sync/checkpoint/download NUNCA apaga nem troca em silêncio um cadastro local não confirmado.
 * - Dado novo do servidor que não conflita desce normalmente (a fila não fica travada).
 * - Diferença local × servidor: só é empurrada (local → API) com confirmação do usuário (forcePush.ts).
 *
 * Como, com o PowerSync: ele só preserva uma linha local enquanto a operação dela está no `ps_crud`. Por isso:
 * - op recusada por referência ausente/acesso (403/404/…) vira CONFLITO em `sync_outbox` (state 'conflict') com a linha
 *   completa (`snapshot`); a transação conclui e a fila anda;
 * - op aceita pela API fica guardada (state 'sent', com snapshot) até um checkpoint posterior ao envio trazer a linha;
 * - depois de cada checkpoint/mudança, `guardLocalRows` devolve à tabela (escrita direta em `ps_data__<tabela>`, sem
 *   gerar nova op) toda linha guardada que o download apagou ou trocou. Se o servidor aceitou e não devolveu,
 *   a linha é restaurada e vira conflito (nunca some).
 *
 * Puro (sem React Native): recebe o executor SQL, testável no Node com SQLite.
 */
import { columnList, entityOfTable, ID_MAP_TABLE, OUTBOX_TABLE, SYNC_TABLES, type SyncEntity } from './mapping'
import type { ParkedOp, UploadOp } from './upload'

const O = OUTBOX_TABLE.table
const OC = OUTBOX_TABLE.columns
const M = ID_MAP_TABLE.table
const MC = ID_MAP_TABLE.columns

export type GuardExecutor = {
  execute(sql: string, params?: unknown[]): Promise<unknown>
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
}

/** Primeira tentativa automática de novo (mesmo dado, sem forçar) depois de um conflito. */
export const CONFLICT_RETRY_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000]

export const CONFLICT_COUNT_SQL = `SELECT COUNT(*) AS n FROM ${O} WHERE ${OC.state.name} = 'conflict'`

export const CONFLICT_LIST_SQL = `SELECT id, ${OC.tableName.name} AS tableName, ${OC.rowId.name} AS rowId, ${OC.op.name} AS op,
  ${OC.opData.name} AS opData, ${OC.snapshot.name} AS snapshot, ${OC.statusCode.name} AS statusCode, ${OC.errorCode.name} AS errorCode,
  ${OC.message.name} AS message, ${OC.field.name} AS field, ${OC.attempts.name} AS attempts, ${OC.createdAt.name} AS createdAt
  FROM ${O} WHERE ${OC.state.name} = 'conflict' ORDER BY ${OC.createdAt.name}, id`

export type ConflictRow = {
  id: string
  tableName: string
  rowId: string
  op: string
  opData: string | null
  snapshot: string | null
  statusCode: number | null
  errorCode: string | null
  message: string | null
  field: string | null
  attempts: number | null
  createdAt: string
}

/** Tabela sincronizada (view do PowerSync) + colunas; null = não é tabela do app (protege o SQL). */
export function syncedTable(tableName: string): { entity: SyncEntity; table: string; columns: string[] } | null {
  const entity = entityOfTable(tableName)
  if (!entity || !(entity in SYNC_TABLES)) return null
  return { entity, table: SYNC_TABLES[entity].table, columns: columnList(entity).map(([name]) => name) }
}

/** Tabela física do PowerSync por trás da view (id, data JSON). */
export const rawTableOf = (table: string) => `ps_data__${table}`

function parseJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function pick(row: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const name of columns) if (name in row && row[name] !== undefined) out[name] = row[name]
  return out
}

async function readRow(db: GuardExecutor, tableName: string, rowId: string): Promise<Record<string, unknown> | null> {
  const target = syncedTable(tableName)
  if (!target) return null
  return db.getOptional<Record<string, unknown>>(`SELECT * FROM ${target.table} WHERE upper(id) = upper(?)`, [rowId])
}

/** Linha local completa para restaurar depois. Sem linha: o próprio PUT (que é a linha inteira). */
export async function snapshotOf(db: GuardExecutor, op: { table: string; id: string; op: string; opData?: Record<string, unknown> }): Promise<string | null> {
  const target = syncedTable(op.table)
  if (!target || op.op === 'DELETE') return null
  const row = await readRow(db, op.table, op.id).catch(() => null)
  if (row) return JSON.stringify(pick(row, target.columns))
  return op.op === 'PUT' && op.opData ? JSON.stringify(pick(op.opData, target.columns)) : null
}

const nowIso = () => new Date().toISOString()

/**
 * Guarda as ops recusadas por referência ausente/acesso como conflito. Mesma linha+op já em conflito: atualiza
 * (PATCH soma os campos; a ordem original é mantida). DELETE em conflito tira os PUT/PATCH antigos da mesma linha.
 */
export async function parkOps(db: GuardExecutor, items: ParkedOp[], newId: () => string, now = nowIso, keepId?: string): Promise<void> {
  for (const { op, rejection } of items) {
    const snapshot = await snapshotOf(db, op)
    const existing = keepId
      ? { id: keepId, opData: null as string | null }
      : await db.getOptional<{ id: string; opData: string | null }>(
          `SELECT id, ${OC.opData.name} AS opData FROM ${O} WHERE ${OC.tableName.name} = ? AND upper(${OC.rowId.name}) = upper(?) AND ${OC.op.name} = ?
             AND ${OC.state.name} = 'conflict' ORDER BY ${OC.createdAt.name} LIMIT 1`,
          [op.table, op.id, op.op],
        )
    const merged = op.op === 'PATCH' && existing?.opData ? { ...(parseJson(existing.opData) ?? {}), ...(op.opData ?? {}) } : op.opData
    const opData = merged ? JSON.stringify(merged) : null
    const attemptsSql = `COALESCE(${OC.attempts.name}, 0) + 1`
    if (existing) {
      const attempts = await db.getOptional<{ n: number }>(`SELECT COALESCE(${OC.attempts.name}, 0) AS n FROM ${O} WHERE id = ?`, [existing.id])
      const wait = CONFLICT_RETRY_MS[Math.min(Number(attempts?.n ?? 0), CONFLICT_RETRY_MS.length - 1)]
      await db.execute(
        `UPDATE ${O} SET ${OC.state.name} = 'conflict', ${OC.opData.name} = ?, ${OC.snapshot.name} = COALESCE(?, ${OC.snapshot.name}),
           ${OC.statusCode.name} = ?, ${OC.errorCode.name} = ?, ${OC.message.name} = ?, ${OC.field.name} = ?, ${OC.lastError.name} = ?,
           ${OC.attempts.name} = ${attemptsSql}, ${OC.nextAt.name} = ? WHERE id = ?`,
        [opData, snapshot, rejection.statusCode, rejection.errorCode, rejection.message, rejection.field, rejection.message, new Date(Date.parse(now()) + wait).toISOString(), existing.id],
      )
    } else {
      await db.execute(
        `INSERT INTO ${O} (id, ${OC.tableName.name}, ${OC.rowId.name}, ${OC.op.name}, ${OC.opData.name}, ${OC.attempts.name}, ${OC.lastError.name},
           ${OC.createdAt.name}, ${OC.state.name}, ${OC.statusCode.name}, ${OC.errorCode.name}, ${OC.message.name}, ${OC.field.name}, ${OC.snapshot.name}, ${OC.nextAt.name})
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'conflict', ?, ?, ?, ?, ?, ?)`,
        [
          newId(), op.table, op.id, op.op, opData, rejection.message, now(),
          rejection.statusCode, rejection.errorCode, rejection.message, rejection.field, snapshot,
          new Date(Date.parse(now()) + CONFLICT_RETRY_MS[0]).toISOString(),
        ],
      )
    }
    if (op.op === 'DELETE') {
      await db.execute(
        `DELETE FROM ${O} WHERE ${OC.tableName.name} = ? AND upper(${OC.rowId.name}) = upper(?) AND ${OC.op.name} != 'DELETE'`,
        [op.table, op.id],
      )
    }
  }
}

/**
 * Ops aceitas pela API: PUT/PATCH ficam guardadas ('sent') até um checkpoint posterior trazer a linha; DELETE aceito
 * encerra tudo o que estava guardado daquela linha (o usuário apagou).
 */
export async function markSent(db: GuardExecutor, ops: UploadOp[], newId: () => string, now = nowIso): Promise<void> {
  for (const op of ops) {
    if (!syncedTable(op.table)) continue
    if (op.op === 'DELETE') {
      await db.execute(`DELETE FROM ${O} WHERE ${OC.tableName.name} = ? AND upper(${OC.rowId.name}) = upper(?) AND ${OC.state.name} IN ('sent', 'conflict')`, [
        op.table,
        op.id,
      ])
      continue
    }
    const snapshot = await snapshotOf(db, op)
    if (!snapshot) continue
    await db.execute(`DELETE FROM ${O} WHERE ${OC.tableName.name} = ? AND upper(${OC.rowId.name}) = upper(?) AND ${OC.state.name} = 'sent'`, [op.table, op.id])
    await db.execute(
      `INSERT INTO ${O} (id, ${OC.tableName.name}, ${OC.rowId.name}, ${OC.op.name}, ${OC.opData.name}, ${OC.attempts.name}, ${OC.createdAt.name},
         ${OC.state.name}, ${OC.snapshot.name}, ${OC.sentAt.name})
       VALUES (?, ?, ?, ?, NULL, 0, ?, 'sent', ?, ?)`,
      [newId(), op.table, op.id, op.op, now(), snapshot, now()],
    )
  }
}

/** Há alteração local ainda na fila do PowerSync para a linha (o próprio PowerSync a protege). */
async function hasPendingCrud(db: GuardExecutor, table: string, rowId: string): Promise<boolean> {
  const row = await db
    .getOptional(`SELECT 1 AS x FROM ps_crud WHERE json_extract(data, '$.type') = ? AND upper(json_extract(data, '$.id')) = upper(?) LIMIT 1`, [table, rowId])
    .catch(() => null)
  return Boolean(row)
}

/** Escreve a linha guardada direto na tabela física (não gera op: não sobe de novo, só volta a aparecer no app). */
export async function rematerialize(db: GuardExecutor, tableName: string, rowId: string, snapshot: string): Promise<boolean> {
  const target = syncedTable(tableName)
  const data = parseJson(snapshot)
  if (!target || !data) return false
  await db.execute(`INSERT OR REPLACE INTO ${rawTableOf(target.table)} (id, data) VALUES (?, ?)`, [rowId, JSON.stringify(pick(data, target.columns))])
  return true
}

function sameRow(row: Record<string, unknown>, snapshot: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(snapshot)) {
    const current = row[key]
    if ((current ?? null) !== (value ?? null) && String(current ?? '') !== String(value ?? '')) return false
  }
  return true
}

type GuardRow = { id: string; tableName: string; rowId: string; op: string; state: string; snapshot: string | null; sentAt: string | null }

export type GuardResult = { restored: number; confirmed: number; dropped: number }

/**
 * Depois de checkpoint/download (e ao abrir o app): nenhuma linha guardada some nem é trocada em silêncio.
 * - conflito: se a linha sumiu ou mudou, volta ao que está no aparelho;
 * - enviado: checkpoint posterior ao envio trouxe a linha → confirmado (sai da guarda); não trouxe → restaura e vira
 *   conflito ("o servidor aceitou mas não devolveu"), para o usuário decidir.
 */
export async function guardLocalRows(db: GuardExecutor, lastSyncedAt: number | null, now = nowIso): Promise<GuardResult> {
  const result: GuardResult = { restored: 0, confirmed: 0, dropped: 0 }
  const rows = await db.getAll<GuardRow>(
    `SELECT id, ${OC.tableName.name} AS tableName, ${OC.rowId.name} AS rowId, ${OC.op.name} AS op, ${OC.state.name} AS state,
       ${OC.snapshot.name} AS snapshot, ${OC.sentAt.name} AS sentAt
     FROM ${O} WHERE ${OC.state.name} IN ('conflict', 'sent') ORDER BY ${OC.createdAt.name}, id`,
  )
  // Mesma linha com várias entradas (PUT em conflito + PATCH depois): vale o snapshot mais recente. Sem isso duas
  // entradas brigariam pela linha (e cada escrita dispararia a guarda de novo).
  const latest = new Map<string, string>()
  for (const entry of rows) if (entry.snapshot && entry.op !== 'DELETE') latest.set(`${entry.tableName}:${entry.rowId.toUpperCase()}`, entry.id)
  for (const entry of rows) {
    const target = syncedTable(entry.tableName)
    const isLatest = latest.get(`${entry.tableName}:${entry.rowId.toUpperCase()}`) === entry.id
    const snapshot = parseJson(entry.snapshot)
    if (!target || !snapshot || entry.op === 'DELETE') {
      if (entry.state === 'sent') {
        await db.execute(`DELETE FROM ${O} WHERE id = ?`, [entry.id])
        result.dropped++
      }
      continue
    }
    if (await hasPendingCrud(db, target.table, entry.rowId)) continue
    const row = await readRow(db, entry.tableName, entry.rowId)
    if (entry.state === 'sent') {
      const sentAt = Date.parse(entry.sentAt ?? '')
      if (lastSyncedAt == null || !Number.isFinite(sentAt) || lastSyncedAt <= sentAt) continue
      if (row || !isLatest) {
        await db.execute(`DELETE FROM ${O} WHERE id = ?`, [entry.id])
        result.confirmed++
        continue
      }
      await rematerialize(db, entry.tableName, entry.rowId, entry.snapshot as string)
      await db.execute(
        `UPDATE ${O} SET ${OC.state.name} = 'conflict', ${OC.opData.name} = ${OC.snapshot.name}, ${OC.op.name} = 'PUT', ${OC.statusCode.name} = 0,
           ${OC.errorCode.name} = 'SERVER_DID_NOT_RETURN', ${OC.message.name} = ?, ${OC.nextAt.name} = ? WHERE id = ?`,
        [
          'O servidor aceitou este cadastro, mas não o devolveu na sincronização. Ele continua salvo neste aparelho.',
          new Date(Date.parse(now()) + CONFLICT_RETRY_MS[0]).toISOString(),
          entry.id,
        ],
      )
      result.restored++
      continue
    }
    if (isLatest && (!row || !sameRow(row, snapshot))) {
      await rematerialize(db, entry.tableName, entry.rowId, entry.snapshot as string)
      result.restored++
    }
  }
  if (result.restored) console.log(`[sync] ${result.restored} cadastro(s) do aparelho protegido(s) contra o download (restaurados)`)
  return result
}

/** Mapa local → servidor de tipos/vacinas (confirmado no envio forçado). */
export async function loadIdMap(db: GuardExecutor): Promise<Map<string, string>> {
  const rows = await db.getAll<{ localId: string; serverId: string }>(`SELECT ${MC.localId.name} AS localId, ${MC.serverId.name} AS serverId FROM ${M}`).catch(() => [])
  return new Map(rows.map((row) => [String(row.localId).toUpperCase(), String(row.serverId).toUpperCase()]))
}

export async function saveIdMap(db: GuardExecutor, entry: { tableName: string; localId: string; serverId: string; name: string }, newId: () => string, now = nowIso) {
  await db.execute(`DELETE FROM ${M} WHERE upper(${MC.localId.name}) = upper(?)`, [entry.localId])
  await db.execute(
    `INSERT INTO ${M} (id, ${MC.tableName.name}, ${MC.localId.name}, ${MC.serverId.name}, ${MC.name.name}, ${MC.createdAt.name}) VALUES (?, ?, ?, ?, ?, ?)`,
    [newId(), entry.tableName, entry.localId.toUpperCase(), entry.serverId.toUpperCase(), entry.name, now()],
  )
}

/** Troca, no que sobe, referências a ids locais mapeados (o próprio id da linha nunca é trocado). */
export function applyIdMap(op: UploadOp, map: Map<string, string>): UploadOp {
  if (!map.size || !op.opData) return op
  let changed = false
  const opData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(op.opData)) {
    const mapped = typeof value === 'string' ? map.get(value.toUpperCase()) : undefined
    if (mapped && key !== 'id') {
      opData[key] = mapped
      changed = true
    } else opData[key] = value
  }
  return changed ? { ...op, opData } : op
}

/** Coluna de referência → tabela do catálogo (para o mapa local → servidor). */
const REF_TABLE_OF_FIELD: Record<string, string> = { animal_type_id: 'animal_types', vaccine_id: 'vaccines' }

/**
 * A API aplicou trocando a referência (ex.: tipo de animal de outro ambiente resolvido pelo nome →
 * `remapped.animal_type_id = { from: idLocal, to: idServidor }`). Sem duplicar tipo e sem perder o cadastro:
 * - guarda o mapa (próximos envios já saem com o id do servidor);
 * - corrige o id nas linhas do aparelho (escrita direta, sem gerar outra op). O download traz a mesma coisa depois.
 */
export async function applyRemaps(
  db: GuardExecutor,
  items: { op: UploadOp; remapped: Record<string, { from: string; to: string }> }[],
  newId: () => string,
  now = nowIso,
): Promise<number> {
  let fixed = 0
  for (const { op, remapped } of items) {
    const target = syncedTable(op.table)
    for (const [field, change] of Object.entries(remapped)) {
      const from = String(change?.from ?? '')
      const to = String(change?.to ?? '')
      if (!from || !to || from.toUpperCase() === to.toUpperCase() || !/^[a-z_]+$/.test(field)) continue
      const refTable = REF_TABLE_OF_FIELD[field] ?? field
      const name = typeof op.opData?.animal_type_name === 'string' ? op.opData.animal_type_name : ''
      await saveIdMap(db, { tableName: refTable, localId: from, serverId: to, name }, newId, now)
      if (target && target.columns.includes(field)) {
        await db.execute(
          `UPDATE ${rawTableOf(target.table)} SET data = json_set(data, '$.${field}', ?) WHERE upper(json_extract(data, '$.${field}')) = upper(?)`,
          [to, from],
        )
        fixed++
      }
      console.log(`[sync] ${op.table}.${field}: ${from} → ${to} (resolvido pelo nome no servidor)`)
    }
  }
  return fixed
}
