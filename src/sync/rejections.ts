import { entityOfTable, fieldOfColumn, REJECTIONS_TABLE, SYNC_TABLES, type SyncEntity } from './mapping'
import type { RejectionRecord } from './upload'

const R = REJECTIONS_TABLE.table
const C = REJECTIONS_TABLE.columns

export type Rejection = RejectionRecord & { id: string; createdAt: string }

export type RejectionExecutor = {
  execute(sql: string, params?: unknown[]): Promise<unknown>
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
}

export const REJECTIONS_LIST_SQL = `SELECT id, ${C.entity.name} AS entity, ${C.tableName.name} AS tableName, ${C.rowId.name} AS rowId,
  ${C.op.name} AS op, ${C.opData.name} AS opData, ${C.statusCode.name} AS statusCode, ${C.errorCode.name} AS errorCode,
  ${C.message.name} AS message, ${C.field.name} AS field, ${C.createdAt.name} AS createdAt FROM ${R} ORDER BY ${C.createdAt.name} DESC, id DESC`

export const REJECTIONS_COUNT_SQL = `SELECT COUNT(*) AS n FROM ${R}`

/** Guarda as recusas (substitui uma anterior da mesma linha+op). Tabela local: não gera upload. */
export async function saveRejections(db: RejectionExecutor, rows: RejectionRecord[], newId: () => string, now = () => new Date().toISOString()) {
  for (const row of rows) {
    await db.execute(`DELETE FROM ${R} WHERE ${C.tableName.name} = ? AND ${C.rowId.name} = ? AND ${C.op.name} = ?`, [row.tableName, row.rowId, row.op])
    await db.execute(
      `INSERT INTO ${R} (id, ${C.entity.name}, ${C.tableName.name}, ${C.rowId.name}, ${C.op.name}, ${C.opData.name}, ${C.statusCode.name}, ${C.errorCode.name}, ${C.message.name}, ${C.field.name}, ${C.createdAt.name})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), row.entity, row.tableName, row.rowId, row.op, row.opData, row.statusCode, row.errorCode, row.message, row.field ?? null, now()],
    )
  }
}

export async function getRejection(db: RejectionExecutor, id: string): Promise<Rejection | null> {
  return db.getOptional<Rejection>(`SELECT * FROM (${REJECTIONS_LIST_SQL}) WHERE id = ?`, [id])
}

/**
 * Descartar = apagar o aviso. A linha local já volta ao estado do servidor sozinha: depois do
 * complete() do upload, o PowerSync aplica o próximo checkpoint do servidor por cima da alteração local
 * recusada (insert some, update volta ao valor anterior, delete reaparece).
 */
export async function discardRejection(db: RejectionExecutor, id: string) {
  await db.execute(`DELETE FROM ${R} WHERE id = ?`, [id])
}

/** Recusa de animal cujo opData aponta para um rebanho (vínculo feito no mesmo cadastro/envio). */
export function herdIdFromAnimalOpData(data: Record<string, unknown>): string | null {
  const value = data.herd_id ?? data.herdId
  return typeof value === 'string' && value.trim() ? String(value).toUpperCase() : null
}

export function isHerdLinkRejection(rejection: Pick<Rejection, 'entity' | 'tableName' | 'opData'>): boolean {
  const entity = entityOfTable(rejection.tableName) ?? rejection.entity
  return entity === 'animals' && Boolean(herdIdFromAnimalOpData(parseOpData(rejection)))
}

export function herdLinksWaitingLabel(count: number): string {
  return count === 1 ? '1 animal aguarda este rebanho' : `${count} animais aguardam este rebanho`
}

export type RejectionGroup = {
  primary: Rejection
  dependents: Rejection[]
  dependentsLabel: string | null
}

/**
 * Agrupa recusas de vínculo de animal debaixo da recusa do rebanho quando o opData.herd_id
 * é o id daquele rebanho. As demais pendências seguem avulsas, na ordem original.
 */
export function groupRejections(rows: readonly Rejection[]): RejectionGroup[] {
  const herdRowIds = new Set(
    rows.filter((row) => (entityOfTable(row.tableName) ?? row.entity) === 'herds').map((row) => String(row.rowId).toUpperCase()),
  )
  const dependentsByHerd = new Map<string, Rejection[]>()
  const groupedAnimalIds = new Set<string>()
  for (const row of rows) {
    if (!isHerdLinkRejection(row)) continue
    const herdId = herdIdFromAnimalOpData(parseOpData(row))
    if (!herdId || !herdRowIds.has(herdId)) continue
    const list = dependentsByHerd.get(herdId) ?? []
    list.push(row)
    dependentsByHerd.set(herdId, list)
    groupedAnimalIds.add(row.id)
  }
  const groups: RejectionGroup[] = []
  const used = new Set<string>()
  for (const row of rows) {
    if (used.has(row.id) || groupedAnimalIds.has(row.id)) continue
    const entity = entityOfTable(row.tableName) ?? row.entity
    if (entity === 'herds') {
      const dependents = dependentsByHerd.get(String(row.rowId).toUpperCase()) ?? []
      dependents.forEach((item) => used.add(item.id))
      used.add(row.id)
      groups.push({
        primary: row,
        dependents,
        dependentsLabel: dependents.length ? herdLinksWaitingLabel(dependents.length) : null,
      })
    }
  }
  for (const row of rows) {
    if (used.has(row.id) || groupedAnimalIds.has(row.id)) continue
    used.add(row.id)
    groups.push({ primary: row, dependents: [], dependentsLabel: null })
  }
  return groups
}

export function dependentAnimalIds(group: Pick<RejectionGroup, 'dependents'>): string[] {
  return group.dependents.map((item) => item.rowId)
}

export async function listRejectionGroups(db: RejectionExecutor): Promise<RejectionGroup[]> {
  const rows = await db.getAll<Rejection>(REJECTIONS_LIST_SQL)
  return groupRejections(rows)
}

/** Descarte do item principal também remove os vínculos dependentes (avisos). A linha local volta ao servidor no checkpoint. */
export async function discardRejectionGroup(db: RejectionExecutor, group: Pick<RejectionGroup, 'primary' | 'dependents'>) {
  for (const row of [group.primary, ...group.dependents]) {
    await discardRejection(db, row.id)
  }
}

export async function discardRejectionByIdWithDependents(db: RejectionExecutor, id: string) {
  const rows = await db.getAll<Rejection>(REJECTIONS_LIST_SQL)
  const groups = groupRejections(rows)
  const group = groups.find((item) => item.primary.id === id) ?? groups.find((item) => item.dependents.some((d) => d.id === id))
  if (group) await discardRejectionGroup(db, group)
  else await discardRejection(db, id)
}

export function groupForHerdRow(rows: readonly Rejection[], herdRowId: string): RejectionGroup | null {
  const groups = groupRejections(rows)
  const id = herdRowId.toUpperCase()
  return groups.find((item) => (entityOfTable(item.primary.tableName) ?? item.primary.entity) === 'herds' && String(item.primary.rowId).toUpperCase() === id) ?? null
}

/** Após corrigir e salvar, remove todas as pendências daquela linha. */
export async function resolveRejectionsForRow(db: RejectionExecutor, tableName: string, rowId: string) {
  await db.execute(`DELETE FROM ${R} WHERE ${C.tableName.name} = ? AND ${C.rowId.name} = ?`, [tableName, rowId])
}

export function parseOpData(rejection: Pick<Rejection, 'opData'>): Record<string, unknown> {
  if (!rejection.opData) return {}
  try {
    const value = JSON.parse(rejection.opData)
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const ENTITY_LABEL: Record<string, string> = {
  farms: 'Fazenda',
  vaccines: 'Vacina',
  animalTypes: 'Tipo de animal',
  animals: 'Animal',
  vaccinations: 'Lançamento de vacina',
  herds: 'Rebanho',
}

const OP_LABEL: Record<string, string> = { PUT: 'Cadastro', PATCH: 'Alteração', DELETE: 'Exclusão' }

/** Título curto para a tela de Pendências, ex.: "Cadastro · Animal 123". */
export function describeRejection(rejection: Pick<Rejection, 'entity' | 'op' | 'opData'>): { title: string; subtitle: string } {
  const data = parseOpData(rejection)
  const entity = ENTITY_LABEL[rejection.entity] ?? 'Registro'
  const name = data.name ?? data.code ?? (data.applied_at ? `aplicada em ${String(data.applied_at).slice(8, 10)}/${String(data.applied_at).slice(5, 7)}/${String(data.applied_at).slice(0, 4)}` : '')
  return {
    title: `${entity}${name ? ` ${String(name)}` : ''}`,
    subtitle: OP_LABEL[rejection.op] ?? rejection.op,
  }
}

/** Rotas de edição por entidade (para "Corrigir"). */
export const ENTITY_ROUTES = {
  farms: { list: '/configuracoes/fazendas', edit: '/configuracoes/fazendas/[id]', create: '/configuracoes/fazendas/nova' },
  vaccines: { list: '/configuracoes/vacinas', edit: '/configuracoes/vacinas/[id]', create: '/configuracoes/vacinas/nova' },
  animalTypes: { list: '/configuracoes/tipos-de-animais', edit: '/configuracoes/tipos-de-animais/[id]', create: '/configuracoes/tipos-de-animais/nova' },
  animals: { list: '/configuracoes/animais', edit: '/configuracoes/animais/[id]', create: '/configuracoes/animais/nova' },
  vaccinations: { list: '/lancamentos', edit: '/lancamentos/[id]', create: '/lancamentos/nova' },
  herds: { list: '/configuracoes/rebanhos', edit: '/configuracoes/rebanhos/[id]', create: '/configuracoes/rebanhos/nova' },
} as const

/**
 * Para onde "Corrigir" leva:
 * - cadastro (PUT) recusado → formulário de NOVO registro preenchido (o servidor não tem a linha; um novo ULID é gerado);
 * - alteração/exclusão recusada com a linha ainda no aparelho → formulário de edição (alteração preenchida);
 * - linha já não existe localmente → formulário de novo preenchido.
 */
export function correctionTarget(rejection: Pick<Rejection, 'entity' | 'op'>, rowExistsLocally: boolean): 'create' | 'edit' {
  if (rejection.op === 'PUT') return 'create'
  return rowExistsLocally ? 'edit' : 'create'
}

/** Códigos que sempre apontam um campo, quando o servidor não manda `details.field`. */
const CODE_FIELD: Record<string, string> = {
  VACCINE_NAME_ALREADY_EXISTS: 'name',
  ANIMAL_TYPE_NAME_ALREADY_EXISTS: 'name',
  ANIMAL_CODE_ALREADY_EXISTS: 'code',
  INVALID_FARM_NAME: 'name',
  INVALID_FARM_CITY: 'city',
  INVALID_STATE: 'state',
  INVALID_VACCINE_NAME: 'name',
  INVALID_WITHDRAWAL_DAYS: 'withdrawalDays',
  INVALID_ANIMAL_TYPE_NAME: 'name',
  INVALID_ANIMAL_CODE: 'code',
  INVALID_ANIMAL_SEX: 'sex',
  INVALID_ANIMAL_BREED: 'breed',
  INVALID_BIRTH_DATE: 'birthDate',
  INVALID_APPLIED_AT: 'appliedAt',
  FARM_OWNER_REQUIRED: 'accountId',
  INVALID_FARM_OWNER: 'accountId',
  FARM_OWNER_FORBIDDEN: 'accountId',
  HERD_NAME_ALREADY_EXISTS: 'name',
  INVALID_HERD_NAME: 'name',
  INVALID_HERD_DESCRIPTION: 'description',
  INVALID_HERD_FORMED_AT: 'formedAt',
  HERD_FARM_MISMATCH: 'herdId',
  HERD_FARM_IMMUTABLE: 'farmId',
  FARM_NOT_FOUND: 'farmId',
}

/**
 * Campo do formulário (nome do app) a destacar no "Corrigir": `details.field` do servidor (coluna snake_case,
 * convertida pelo mapping) ou, sem ele, o campo típico do código. `id` não é campo de formulário.
 */
export function rejectionFormField(rejection: Pick<Rejection, 'entity' | 'tableName' | 'errorCode'> & { field?: string | null }): string | null {
  const entity = entityOfTable(rejection.tableName) ?? (rejection.entity as SyncEntity)
  if (rejection.field && rejection.field !== 'id') {
    const field = SYNC_TABLES[entity as SyncEntity] ? fieldOfColumn(entity as SyncEntity, rejection.field) : null
    if (field) return field
  }
  if (rejection.errorCode === 'CONFLICT' && (entity === 'vaccines' || entity === 'animalTypes' || entity === 'herds')) return 'name'
  return CODE_FIELD[rejection.errorCode] ?? null
}
