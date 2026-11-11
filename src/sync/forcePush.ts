/**
 * Envio forçado (local → API), SÓ depois de o usuário confirmar na tela de conflitos.
 *
 * Para cada conflito, na ordem em que aconteceu (fazenda antes do animal, animal antes da vacinação):
 * 1. reenvia o que está no aparelho (PUT = cria ou substitui no servidor);
 * 2. tipo de animal de outro ambiente: o PUT do animal já leva `animal_type_name` e o SERVIDOR resolve pelo nome
 *    (devolve `remapped`, o id local é corrigido). Se ainda vier ANIMAL_TYPE_NOT_FOUND, o servidor não tem o tipo e o
 *    usuário não é admin: continua conflito, com mensagem. Se a VACINA não existe (id local de outro ambiente):
 *    - procura no servidor um item com o MESMO NOME (sem diferença de maiúsculas/espaços) → liga o id local ao do
 *      servidor (sync_id_map), o cadastro passa a usar o do servidor e é reenviado — sem criar tipo duplicado;
 *    - sem item com esse nome → cria no servidor o item do aparelho (PUT com o id local; tipo de animal só admin);
 * 3. aceito → sai dos conflitos (guardado até o download confirmar); recusa real (400/409/422) → Pendências;
 *    outro motivo → continua como conflito, com a mensagem nova. Nada é apagado do aparelho.
 *
 * Puro (sem React Native): http e banco injetados.
 */
import { applyIdMap, loadIdMap, rawTableOf, saveIdMap, snapshotOf, syncedTable, type ConflictRow, type GuardExecutor } from './localGuard'
import { OUTBOX_TABLE } from './mapping'
import { sendOutboxEntry } from './outbox'
import { publicApiMessage } from '../api/errors'
import { FORCE_PUSH_TABLE_ORDER, type PostBatch, type RejectionRecord, type UploadDeps } from './upload'

const O = OUTBOX_TABLE.table
const OC = OUTBOX_TABLE.columns

/** Código de "referência não existe" → tabela/coluna do catálogo citado. */
export const CATALOG_REFS: Record<string, { table: 'animal_types' | 'vaccines'; field: string; label: string }> = {
  // Tipo de animal: o servidor resolve pelo `animal_type_name` (contrato 11/11) e devolve `remapped`; aqui só vacina,
  // que ainda não tem nome no contrato (follow-up da API: `vaccine_name`).
  VACCINE_NOT_FOUND: { table: 'vaccines', field: 'vaccine_id', label: 'vacina' },
}

/** Mensagem quando nem o nome do tipo resolve: o servidor não tem e o usuário não é admin. */
function animalTypeMissingMessage(data: Record<string, unknown>): string {
  const name = typeof data.animal_type_name === 'string' ? ` "${data.animal_type_name}"` : ''
  return `O servidor não tem o tipo de animal${name} e só um administrador pode criá-lo. O cadastro continua salvo neste aparelho.`
}

const tableRank = (table: string) => {
  const index = (FORCE_PUSH_TABLE_ORDER as readonly string[]).indexOf(table)
  return index < 0 ? FORCE_PUSH_TABLE_ORDER.length : index
}

export type CatalogItem = { id: string; name: string }

export type ForcePushDeps = Omit<UploadDeps, 'park' | 'markSent' | 'mapOp'> & {
  /** GET /animal-types ou /vaccines (todas as páginas). */
  fetchCatalog: (table: 'animal_types' | 'vaccines') => Promise<CatalogItem[]>
  newId: () => string
  now?: () => string
}

export type ForcePushResult = {
  id: string
  tableName: string
  rowId: string
  outcome: 'sent' | 'rejected' | 'conflict'
  message: string
  /** Ligação feita por nome (para o relatório na tela). */
  linked?: { label: string; name: string; localId: string; serverId: string; created: boolean }
}

export const normalizeName = (name: unknown) => String(name ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

type EntryRow = Pick<ConflictRow, 'id' | 'tableName' | 'rowId' | 'op' | 'opData' | 'createdAt'> & {
  errorCode: string | null
  message: string | null
}

async function readEntry(db: GuardExecutor, id: string): Promise<EntryRow | null> {
  return db.getOptional<EntryRow>(
    `SELECT id, ${OC.tableName.name} AS tableName, ${OC.rowId.name} AS rowId, ${OC.op.name} AS op, ${OC.opData.name} AS opData,
       ${OC.createdAt.name} AS createdAt, ${OC.errorCode.name} AS errorCode, ${OC.message.name} AS message, ${OC.state.name} AS state
     FROM ${O} WHERE id = ?`,
    [id],
  )
}

/** O cadastro passa a apontar para o id do servidor: na entrada, na linha do aparelho e no que estiver guardado. */
async function rebind(db: GuardExecutor, entry: EntryRow, field: string, serverId: string) {
  const data = entry.opData ? (JSON.parse(entry.opData) as Record<string, unknown>) : {}
  data[field] = serverId
  const target = syncedTable(entry.tableName)
  if (target) {
    // Escrita direta na tabela física: o app mostra o tipo certo sem gerar outra op (o PUT forçado já leva o id novo).
    await db
      .execute(`UPDATE ${rawTableOf(target.table)} SET data = json_set(data, '$.${field}', ?) WHERE upper(id) = upper(?)`, [serverId, entry.rowId])
      .catch(() => undefined)
  }
  const snapshot = await snapshotOf(db, { table: entry.tableName, id: entry.rowId, op: entry.op, opData: data })
  await db.execute(`UPDATE ${O} SET ${OC.opData.name} = ?, ${OC.snapshot.name} = COALESCE(?, ${OC.snapshot.name}) WHERE id = ?`, [
    JSON.stringify(data),
    snapshot,
    entry.id,
  ])
}

async function putCatalogItem(post: PostBatch, table: 'animal_types' | 'vaccines', id: string, local: Record<string, unknown>) {
  const opData: Record<string, unknown> = { name: local.name }
  if (table === 'vaccines' && local.withdrawal_days != null) opData.withdrawal_days = Number(local.withdrawal_days)
  const response = await post({ batch: [{ op: 'PUT', table, id: id.toUpperCase(), opData }] })
  const record = response.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {}
  const result = Array.isArray(record.results) ? (record.results[0] as { status?: string; error?: { statusCode?: number; error?: string; message?: string } }) : undefined
  if (response.status >= 200 && response.status < 300 && (!result || result.status === 'applied')) return { ok: true as const }
  const status = result?.error?.statusCode ?? response.status
  const code = result?.error?.error ?? String(record.error ?? `HTTP_${status}`)
  return { ok: false as const, status, code, message: publicApiMessage({ status, code, message: result?.error?.message }) }
}

/**
 * Força o envio dos conflitos escolhidos (todos se `ids` vazio). Chame SÓ depois da confirmação do usuário.
 */
export async function forcePushConflicts(db: GuardExecutor, deps: ForcePushDeps, ids?: string[]): Promise<ForcePushResult[]> {
  const all = await db.getAll<{ id: string; tableName: string }>(
    `SELECT id, ${OC.tableName.name} AS tableName FROM ${O} WHERE ${OC.state.name} = 'conflict' ORDER BY ${OC.createdAt.name}, id`,
  )
  // Ordem do contrato: farms → vaccines → herds → animals → animal_vaccinations → shipments → shipment_animals
  // (estável: dentro da mesma tabela, a ordem em que aconteceu).
  const selected = (ids?.length ? all.filter((row) => ids.includes(row.id)) : all)
    .map((row, index) => ({ ...row, index }))
    .sort((a, b) => tableRank(a.tableName) - tableRank(b.tableName) || a.index - b.index)
  const catalogs = new Map<string, CatalogItem[]>()
  const catalog = async (table: 'animal_types' | 'vaccines', refresh = false) => {
    if (refresh || !catalogs.has(table)) catalogs.set(table, await deps.fetchCatalog(table))
    return catalogs.get(table) ?? []
  }
  const results: ForcePushResult[] = []
  for (const { id } of selected) {
    let linked: ForcePushResult['linked']
    let final: ForcePushResult | null = null
    for (let attempt = 0; attempt < 4 && !final; attempt++) {
      const entry = await readEntry(db, id)
      if (!entry) break
      const map = await loadIdMap(db)
      let rejected: RejectionRecord | null = null
      const outcome = await sendOutboxEntry(db, entry, {
        ...deps,
        mapOp: (op) => applyIdMap(op, map),
        saveRejections: async (rows) => {
          rejected = rows[0] ?? null
          await deps.saveRejections(rows)
        },
      })
      if (outcome === 'applied') {
        final = { id, tableName: entry.tableName, rowId: entry.rowId, outcome: 'sent', message: 'Enviado para o servidor.', linked }
        break
      }
      if (outcome === 'rejected') {
        final = { id, tableName: entry.tableName, rowId: entry.rowId, outcome: 'rejected', message: (rejected as RejectionRecord | null)?.message ?? 'O servidor recusou os dados: veja Pendências.', linked }
        break
      }
      // Continua conflito: é referência de catálogo que dá para resolver?
      const after = await readEntry(db, id)
      const ref = after?.errorCode ? CATALOG_REFS[after.errorCode] : undefined
      const data = after?.opData ? (JSON.parse(after.opData) as Record<string, unknown>) : {}
      const localRefId = ref ? data[ref.field] : undefined
      if (!after || !ref || typeof localRefId !== 'string' || linked) {
        const message = after?.errorCode === 'ANIMAL_TYPE_NOT_FOUND' ? animalTypeMissingMessage(data) : (after?.message ?? 'O servidor ainda não aceitou.')
        if (after?.errorCode === 'ANIMAL_TYPE_NOT_FOUND') {
          await db.execute(`UPDATE ${O} SET ${OC.message.name} = ? WHERE id = ?`, [message, id]).catch(() => undefined)
        }
        final = { id, tableName: entry.tableName, rowId: entry.rowId, outcome: 'conflict', message, linked }
        break
      }
      const local = await db.getOptional<Record<string, unknown>>(`SELECT * FROM ${ref.table} WHERE upper(id) = upper(?)`, [localRefId])
      if (!local?.name) {
        final = {
          id, tableName: entry.tableName, rowId: entry.rowId, outcome: 'conflict',
          message: `O ${ref.label} usado neste cadastro não está mais no aparelho. Edite o cadastro e escolha outro ${ref.label}.`,
        }
        break
      }
      let match = (await catalog(ref.table)).find((item) => normalizeName(item.name) === normalizeName(local.name))
      if (!match) {
        // Não há com esse nome no servidor: cria o do aparelho (mesmo id), só agora que o usuário confirmou.
        const created = await putCatalogItem(deps.post, ref.table, localRefId, local)
        if (!created.ok && created.status === 409) match = (await catalog(ref.table, true)).find((item) => normalizeName(item.name) === normalizeName(local.name))
        if (!created.ok && !match) {
          const who = created.status === 403 ? ` Só um administrador pode criar ${ref.label} no servidor.` : ''
          final = {
            id, tableName: entry.tableName, rowId: entry.rowId, outcome: 'conflict',
            message: `O servidor não tem o ${ref.label} "${String(local.name)}" e não foi possível criá-lo (${created.message}).${who} O cadastro continua salvo neste aparelho.`,
          }
          break
        }
        if (created.ok) linked = { label: ref.label, name: String(local.name), localId: localRefId, serverId: localRefId, created: true }
      }
      if (match) {
        await saveIdMap(db, { tableName: ref.table, localId: localRefId, serverId: match.id, name: String(local.name) }, deps.newId, deps.now)
        await rebind(db, after, ref.field, match.id.toUpperCase())
        linked = { label: ref.label, name: String(local.name), localId: localRefId, serverId: match.id, created: false }
      }
    }
    if (final) results.push(final)
  }
  return results
}
