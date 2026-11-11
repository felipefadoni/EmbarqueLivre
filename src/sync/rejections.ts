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

/** Recusa de vínculo embarque ↔ animal cujo opData aponta para um embarque (vínculo feito no mesmo envio). */
export function shipmentIdFromLinkOpData(data: Record<string, unknown>): string | null {
  const value = data.shipment_id ?? data.shipmentId
  return typeof value === 'string' && value.trim() ? String(value).toUpperCase() : null
}

export function isShipmentLinkRejection(rejection: Pick<Rejection, 'entity' | 'tableName' | 'opData'>): boolean {
  const entity = entityOfTable(rejection.tableName) ?? rejection.entity
  return entity === 'shipmentAnimals' && Boolean(shipmentIdFromLinkOpData(parseOpData(rejection)))
}

export function shipmentLinksWaitingLabel(count: number): string {
  return count === 1 ? '1 animal aguarda este embarque' : `${count} animais aguardam este embarque`
}

/** Pais que agrupam recusas dependentes (o cadastro recusado leva junto os vínculos do mesmo envio). */
const PARENT_RULES: {
  parent: SyncEntity
  isDependent: (row: Rejection) => boolean
  parentIdOf: (row: Rejection) => string | null
  label: (count: number) => string
}[] = [
  {
    parent: 'herds',
    isDependent: (row) => isHerdLinkRejection(row),
    parentIdOf: (row) => herdIdFromAnimalOpData(parseOpData(row)),
    label: herdLinksWaitingLabel,
  },
  {
    parent: 'shipments',
    isDependent: (row) => isShipmentLinkRejection(row),
    parentIdOf: (row) => shipmentIdFromLinkOpData(parseOpData(row)),
    label: shipmentLinksWaitingLabel,
  },
]

/**
 * Agrupa recusas dependentes debaixo da recusa do "pai" ainda aberta:
 * - vínculos de animal (opData.herd_id) debaixo do rebanho recusado;
 * - vínculos de embarque (shipment_animals.opData.shipment_id) debaixo do embarque recusado.
 * As demais pendências seguem avulsas, na ordem original.
 */
export function groupRejections(rows: readonly Rejection[]): RejectionGroup[] {
  const entityOf = (row: Rejection) => entityOfTable(row.tableName) ?? row.entity
  const dependentsByParent = new Map<string, Rejection[]>()
  const groupedIds = new Set<string>()
  for (const rule of PARENT_RULES) {
    const parentIds = new Set(rows.filter((row) => entityOf(row) === rule.parent).map((row) => String(row.rowId).toUpperCase()))
    for (const row of rows) {
      if (groupedIds.has(row.id) || !rule.isDependent(row)) continue
      const parentId = rule.parentIdOf(row)
      if (!parentId || !parentIds.has(parentId)) continue
      const key = `${rule.parent}:${parentId}`
      const list = dependentsByParent.get(key) ?? []
      list.push(row)
      dependentsByParent.set(key, list)
      groupedIds.add(row.id)
    }
  }
  const groups: RejectionGroup[] = []
  const used = new Set<string>()
  for (const row of rows) {
    if (used.has(row.id) || groupedIds.has(row.id)) continue
    const rule = PARENT_RULES.find((item) => item.parent === entityOf(row))
    if (!rule) continue
    const dependents = dependentsByParent.get(`${rule.parent}:${String(row.rowId).toUpperCase()}`) ?? []
    dependents.forEach((item) => used.add(item.id))
    used.add(row.id)
    groups.push({ primary: row, dependents, dependentsLabel: dependents.length ? rule.label(dependents.length) : null })
  }
  for (const row of rows) {
    if (used.has(row.id) || groupedIds.has(row.id)) continue
    used.add(row.id)
    groups.push({ primary: row, dependents: [], dependentsLabel: null })
  }
  return groups
}

/** Animais que aguardavam o pai recusado (rebanho: row_id do animal; embarque: animal_id do vínculo). */
export function dependentAnimalIds(group: Pick<RejectionGroup, 'dependents'>): string[] {
  return group.dependents.map((item) => {
    if ((entityOfTable(item.tableName) ?? item.entity) === 'shipmentAnimals') {
      const animalId = parseOpData(item).animal_id ?? parseOpData(item).animalId
      return typeof animalId === 'string' ? animalId : item.rowId
    }
    return item.rowId
  })
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
  shipments: 'Embarque',
  shipmentAnimals: 'Animal no embarque',
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
  // Embarques: área própria na tab bar (SHIPMENT_FLOW_CONTRACT.routes).
  shipments: { list: '/embarques', edit: '/embarques/[id]', create: '/embarques/nova' },
} as const

/**
 * "Corrigir" de um vínculo embarque ↔ animal recusado: abre o embarque (análise) do vínculo.
 * Usa o shipment_id do opData; se não houver (ex.: DELETE), procura o vínculo ainda no aparelho.
 */
export async function shipmentIdForLinkRejection(db: RejectionExecutor, rejection: Pick<Rejection, 'rowId' | 'opData'>): Promise<string | null> {
  const fromOp = shipmentIdFromLinkOpData(parseOpData(rejection))
  if (fromOp) return fromOp
  const T = SYNC_TABLES.shipmentAnimals
  const row = await db.getOptional<{ shipmentId: string }>(
    `SELECT ${T.columns.shipmentId.name} AS shipmentId FROM ${T.table} WHERE id = ?`,
    [rejection.rowId],
  )
  return row?.shipmentId ?? null
}

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
  SHIPMENT_NAME_ALREADY_EXISTS: 'name',
  INVALID_SHIPMENT_NAME: 'name',
  INVALID_SHIPPED_ON: 'shippedOn',
  SHIPMENT_FARM_IMMUTABLE: 'farmId',
  SHIPMENT_ANIMAL_FARM_MISMATCH: 'animalIds',
  ANIMAL_ALREADY_IN_SHIPMENT: 'animalIds',
  // Status, finalizar, peso e foto (contrato final; no sync o servidor aponta weight_kg / photo_id)
  SHIPMENT_FINISHED: 'animalIds',
  SHIPMENT_EMPTY: 'animalIds',
  INVALID_SHIPMENT_ANIMAL_WEIGHT: 'weightKg',
  SHIPMENT_ANIMAL_PHOTO_REQUIRED: 'photoId',
  SHIPMENT_PHOTO_NOT_FOUND: 'photoId',
  SHIPMENT_PHOTO_IN_USE: 'photoId',
  INVALID_SHIPMENT_PHOTO: 'photoId',
  ANIMAL_ALREADY_SHIPPED: 'animalIds',
  INVALID_SHIPMENT_STATUS: 'status',
}

/**
 * Campo do formulário (nome do app) a destacar no "Corrigir": `details.field` do servidor (coluna snake_case,
 * convertida pelo mapping) ou, sem ele, o campo típico do código. `id` não é campo de formulário.
 */
export function rejectionFormField(rejection: Pick<Rejection, 'entity' | 'tableName' | 'errorCode'> & { field?: string | null }): string | null {
  const entity = entityOfTable(rejection.tableName) ?? (rejection.entity as SyncEntity)
  // Embarque: o servidor aponta o vínculo (REST `animalIds`; upload `animal_id`/`shipment_id`) → seção de animais.
  if ((entity === 'shipments' || entity === 'shipmentAnimals') && rejection.field && ['animalIds', 'animal_id', 'shipment_id'].includes(rejection.field)) {
    return 'animalIds'
  }
  if (entity === 'shipmentAnimals') return 'animalIds'
  if (rejection.field && rejection.field !== 'id') {
    const field = SYNC_TABLES[entity as SyncEntity] ? fieldOfColumn(entity as SyncEntity, rejection.field) : null
    if (field) return field
  }
  if (rejection.errorCode === 'CONFLICT' && (entity === 'vaccines' || entity === 'animalTypes' || entity === 'herds' || entity === 'shipments')) return 'name'
  return CODE_FIELD[rejection.errorCode] ?? null
}
