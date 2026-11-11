/**
 * Consultas SQL locais (PowerSync/SQLite). Tudo gerado a partir de `mapping.ts`.
 * Cada builder devolve { sql, params } com colunas apelidadas para os nomes de campo do app,
 * e os mappers convertem a linha nos tipos já usados pelas telas.
 * Puro (sem React Native) para testes no Node com SQLite real.
 */
import type { Animal, AnimalType, Farm, Herd, Shipment, Vaccine } from '../api/catalog'
import { HERDS_CONTRACT } from '../api/herdsContract'
import { SHIPMENTS_CONTRACT, shipmentStatusOf, type ShipmentStatus } from '../api/shipmentsContract'
import type { AnimalWithdrawal, VaccinationEntry, WithdrawalApplication } from '../api/contract'
import { colOf as c, PHOTO_QUEUE_TABLE, tableOf as t } from './mapping'
import { isActiveOn, summarizeWithdrawal } from './withdrawal'

export type SqlQuery = { sql: string; params: unknown[] }

export const LOCAL_PAGE_SIZE = 30
/** Para listas de opções (selects): tudo que há no aparelho. */
export const ALL_ROWS = 100_000

const F = t('farms')
const V = t('vaccines')
const T = t('animalTypes')
const A = t('animals')
const AV = t('vaccinations')
const H = t('herds')
const S = t('shipments')
const SA = t('shipmentAnimals')
const PQ = PHOTO_QUEUE_TABLE.table

/**
 * Animal "embarcado" (saiu da fazenda num embarque FINALIZADO): some da lista de Animais, dos pickers e do Dashboard,
 * mas continua no detalhe do embarque. Flag OFICIAL: `animals.shipped_at IS NOT NULL` (vem do servidor no sync; o app
 * também grava localmente ao finalizar, para sumir na hora, mesmo offline).
 */
export function animalShippedExpr(alias = 'a'): string {
  return `(${alias}.${c('animals', 'shippedAt')} IS NOT NULL)`
}

/** Data efetiva de fim de carência: a gravada; se ausente, applied_at + days no SQLite. */
function untilExpr(alias: string) {
  return `COALESCE(${alias}.${c('vaccinations', 'withdrawalUntil')}, date(${alias}.${c('vaccinations', 'appliedAt')}, '+' || ${alias}.${c('vaccinations', 'withdrawalDays')} || ' days'))`
}

function limitClause(limit: number | undefined) {
  return Math.max(1, Math.trunc(limit ?? LOCAL_PAGE_SIZE))
}

// ---------- Fazendas ----------

const farmSelect = `SELECT f.id AS id,
  COALESCE(f.${c('farms', 'accountId')}, f.${c('farms', 'ownerUserId')}) AS accountId,
  f.${c('farms', 'ownerUserId')} AS ownerUserId,
  f.${c('farms', 'name')} AS name,
  f.${c('farms', 'city')} AS city, f.${c('farms', 'state')} AS state
  FROM ${F} f`

export function farmsListQuery(limit?: number): SqlQuery {
  return { sql: `${farmSelect} ORDER BY f.${c('farms', 'name')} COLLATE NOCASE, f.id LIMIT ?`, params: [limitClause(limit) + 1] }
}

export function farmByIdQuery(id: string): SqlQuery {
  return { sql: `${farmSelect} WHERE f.id = ?`, params: [id] }
}

/** Sem tabela de contas no sync: o nome da conta só vem do REST (GET /farms/:id), online. */
export type FarmRow = {
  id: string
  accountId: string | null
  ownerUserId: string | null
  name: string
  city: string
  state: string
}

export function rowToFarm(row: FarmRow): Farm {
  const accountId = row.accountId || row.ownerUserId || ''
  return {
    id: row.id,
    accountId,
    ownerUserId: row.ownerUserId || accountId,
    name: row.name ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
  }
}

// ---------- Vacinas e tipos ----------

const vaccineSelect = `SELECT v.id AS id, v.${c('vaccines', 'name')} AS name, v.${c('vaccines', 'withdrawalDays')} AS withdrawalDays FROM ${V} v`

export function vaccinesListQuery(limit?: number): SqlQuery {
  return { sql: `${vaccineSelect} ORDER BY v.${c('vaccines', 'name')} COLLATE NOCASE, v.id LIMIT ?`, params: [limitClause(limit) + 1] }
}

export function vaccineByIdQuery(id: string): SqlQuery {
  return { sql: `${vaccineSelect} WHERE v.id = ?`, params: [id] }
}

export function rowToVaccine(row: { id: string; name: string; withdrawalDays: number | null }): Vaccine {
  return { id: row.id, name: row.name ?? '', withdrawalDays: Number(row.withdrawalDays ?? 0) }
}

const typeSelect = `SELECT at.id AS id, at.${c('animalTypes', 'name')} AS name FROM ${T} at`

export function animalTypesListQuery(limit?: number): SqlQuery {
  return { sql: `${typeSelect} ORDER BY at.${c('animalTypes', 'name')} COLLATE NOCASE, at.id LIMIT ?`, params: [limitClause(limit) + 1] }
}

export function animalTypeByIdQuery(id: string): SqlQuery {
  return { sql: `${typeSelect} WHERE at.id = ?`, params: [id] }
}

export function rowToAnimalType(row: { id: string; name: string }): AnimalType {
  return { id: row.id, name: row.name ?? '' }
}

// ---------- Animais ----------

/** Agregado de carência por animal (uma passada em animal_vaccinations). */
export const withdrawalAgg = `SELECT av.${c('vaccinations', 'animalId')} AS aid,
  SUM(av.${c('vaccinations', 'withdrawalDays')}) AS total, MAX(${untilExpr('av')}) AS freeAt
  FROM ${AV} av GROUP BY av.${c('vaccinations', 'animalId')}`

/**
 * Mesmo agregado, mas só com as aplicações feitas até `?` (inclusive): carência vista NO dia do embarque.
 * Uma aplicação posterior ao embarque não conta (não pode deixar o animal "em carência" naquele embarque).
 */
export const withdrawalAggAppliedUntil = `SELECT av.${c('vaccinations', 'animalId')} AS aid,
  SUM(av.${c('vaccinations', 'withdrawalDays')}) AS total, MAX(${untilExpr('av')}) AS freeAt
  FROM ${AV} av WHERE substr(av.${c('vaccinations', 'appliedAt')}, 1, 10) <= ? GROUP BY av.${c('vaccinations', 'animalId')}`

function animalSelect(todayParam = '?', agg = withdrawalAgg) {
  return `SELECT a.id AS id, a.${c('animals', 'code')} AS code, a.${c('animals', 'farmId')} AS farmId,
  a.${c('animals', 'animalTypeId')} AS animalTypeId, a.${c('animals', 'sex')} AS sex, a.${c('animals', 'breed')} AS breed,
  a.${c('animals', 'birthDate')} AS birthDate, a.${c('animals', 'herdId')} AS herdId, h.${c('herds', 'name')} AS herdName,
  f.${c('farms', 'name')} AS farmName, at.${c('animalTypes', 'name')} AS animalTypeName,
  COALESCE(w.total, 0) AS totalWithdrawalDays, w.freeAt AS freeAt,
  CASE WHEN w.freeAt IS NOT NULL AND ${todayParam} < w.freeAt THEN 1 ELSE 0 END AS inWithdrawal,
  CASE WHEN ${animalShippedExpr('a')} THEN 1 ELSE 0 END AS shipped
  FROM ${A} a
  LEFT JOIN ${F} f ON f.id = a.${c('animals', 'farmId')}
  LEFT JOIN ${T} at ON at.id = a.${c('animals', 'animalTypeId')}
  LEFT JOIN ${H} h ON h.id = a.${c('animals', 'herdId')}
  LEFT JOIN (${agg}) w ON w.aid = a.id`
}

/**
 * Situação de carência do animal em `today` (data local do aparelho; livre NO dia withdrawal_until):
 * - liberado: tem vacinação e freeAt <= hoje (= "apto para embarque")
 * - carencia: freeAt > hoje
 * - sem_historico: nenhuma vacinação (NÃO é apto; categoria própria)
 * - libera7: em carência e fica livre em até 7 dias (hoje < freeAt <= hoje + 7)
 */
export const ANIMAL_SITUATIONS = ['liberado', 'carencia', 'sem_historico', 'libera7'] as const
export type AnimalSituation = (typeof ANIMAL_SITUATIONS)[number]
export function isAnimalSituation(value: unknown): value is AnimalSituation {
  return typeof value === 'string' && (ANIMAL_SITUATIONS as readonly string[]).includes(value)
}

/** Filtro de Situação (mesma regra da lista de Animais) em relação à data `ref` (hoje, ou o dia do embarque). */
function situationWhere(situacao: AnimalSituation | undefined, ref: string, where: string[], params: unknown[]) {
  // `ref` vem do JS (fuso do aparelho); date(?, '+7 days') só soma dias a essa data (nunca a data atual do SQLite, que é UTC).
  if (situacao === 'liberado') {
    where.push('w.freeAt IS NOT NULL AND w.freeAt <= ?')
    params.push(ref)
  } else if (situacao === 'carencia') {
    where.push('w.freeAt > ?')
    params.push(ref)
  } else if (situacao === 'sem_historico') {
    where.push('w.aid IS NULL')
  } else if (situacao === 'libera7') {
    where.push("w.freeAt > ? AND w.freeAt <= date(?, '+7 days')")
    params.push(ref, ref)
  }
}

export type AnimalFilters = {
  farmId?: string
  animalTypeId?: string
  herdId?: string
  code?: string
  situacao?: AnimalSituation
  /** Inclui os embarcados (embarque finalizado). Padrão: não (lista de cadastrados, pickers). */
  includeShipped?: boolean
}

export function animalsListQuery(filters: AnimalFilters, today: string, limit?: number): SqlQuery {
  const where: string[] = []
  const params: unknown[] = [today]
  if (!filters.includeShipped) where.push(`NOT ${animalShippedExpr('a')}`)
  if (filters.farmId) {
    where.push(`a.${c('animals', 'farmId')} = ?`)
    params.push(filters.farmId)
  }
  if (filters.animalTypeId) {
    where.push(`a.${c('animals', 'animalTypeId')} = ?`)
    params.push(filters.animalTypeId)
  }
  if (filters.herdId) {
    where.push(`a.${c('animals', 'herdId')} = ?`)
    params.push(filters.herdId)
  }
  const code = filters.code?.trim()
  if (code) {
    // Parcial e sem diferenciar maiúsculas; instr evita tratar % e _ como curingas.
    where.push(`instr(lower(a.${c('animals', 'code')}), lower(?)) > 0`)
    params.push(code)
  }
  situationWhere(filters.situacao, today, where, params)
  params.push(limitClause(limit) + 1)
  const order = filters.situacao === 'libera7' ? 'w.freeAt, ' : ''
  return {
    sql: `${animalSelect()} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}a.${c('animals', 'code')} COLLATE NOCASE, a.id LIMIT ?`,
    params,
  }
}

/**
 * Animais para a análise/validação de EMBARQUE no dia `shippedOn` (fonte única da tela e do repositório).
 * freeAt = maior withdrawal_until só das aplicações com applied_at <= shippedOn; inWithdrawal = shippedOn < freeAt.
 */
export function shipmentAnimalsQuery(filters: { farmId?: string; animalId?: string }, shippedOn: string, limit?: number): SqlQuery {
  const where: string[] = []
  // 1º ? = CASE (shippedOn < freeAt); 2º ? = filtro applied_at <= shippedOn no agregado.
  const params: unknown[] = [shippedOn, shippedOn]
  if (filters.farmId) {
    where.push(`a.${c('animals', 'farmId')} = ?`)
    params.push(filters.farmId)
  }
  if (filters.animalId) {
    where.push('a.id = ?')
    params.push(filters.animalId)
  }
  params.push(limitClause(limit ?? ALL_ROWS) + 1)
  return {
    sql: `${animalSelect('?', withdrawalAggAppliedUntil)} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.${c('animals', 'code')} COLLATE NOCASE, a.id LIMIT ?`,
    params,
  }
}

export function animalByIdQuery(id: string, today: string): SqlQuery {
  return { sql: `${animalSelect()} WHERE a.id = ?`, params: [today, id] }
}

export type AnimalRow = {
  id: string
  code: string
  farmId: string
  animalTypeId: string
  sex: string | null
  breed: string | null
  birthDate: string | null
  herdId: string | null
  herdName: string | null
  farmName: string | null
  animalTypeName: string | null
  totalWithdrawalDays: number
  freeAt: string | null
  inWithdrawal: number
  /** 1 = embarcado (embarque finalizado). */
  shipped?: number
}

export function rowToAnimal(row: AnimalRow, withdrawal: AnimalWithdrawal | null = null): Animal {
  const sex = String(row.sex ?? '').toUpperCase()
  return {
    id: row.id,
    code: row.code ?? '',
    farmId: row.farmId ?? '',
    animalTypeId: row.animalTypeId ?? '',
    sex: sex === 'M' || sex === 'F' ? sex : null,
    breed: row.breed ?? null,
    birthDate: row.birthDate ? String(row.birthDate).slice(0, 10) : null,
    herdId: row.herdId ?? null,
    herdName: row.herdName ?? undefined,
    farmName: row.farmName ?? undefined,
    animalTypeName: row.animalTypeName ?? undefined,
    withdrawal,
    withdrawalSummary: {
      inWithdrawal: Boolean(row.inWithdrawal),
      freeAt: row.freeAt ?? null,
      totalWithdrawalDays: Number(row.totalWithdrawalDays ?? 0),
    },
  }
}

// ---------- Lançamentos (vacinações) ----------

function vaccinationSelect() {
  return `SELECT av.id AS id, av.${c('vaccinations', 'animalId')} AS animalId, a.${c('animals', 'code')} AS animalCode,
  COALESCE(a.${c('animals', 'farmId')}, av.${c('vaccinations', 'farmId')}) AS farmId, f.${c('farms', 'name')} AS farmName,
  at.${c('animalTypes', 'name')} AS animalTypeName, av.${c('vaccinations', 'vaccineId')} AS vaccineId, v.${c('vaccines', 'name')} AS vaccineName,
  av.${c('vaccinations', 'appliedAt')} AS appliedAt, av.${c('vaccinations', 'withdrawalDays')} AS withdrawalDays,
  ${untilExpr('av')} AS withdrawalUntil, av.${c('vaccinations', 'createdByUserId')} AS createdByUserId,
  av.${c('vaccinations', 'createdAt')} AS createdAt, av.${c('vaccinations', 'updatedAt')} AS updatedAt
  FROM ${AV} av
  LEFT JOIN ${A} a ON a.id = av.${c('vaccinations', 'animalId')}
  LEFT JOIN ${F} f ON f.id = COALESCE(a.${c('animals', 'farmId')}, av.${c('vaccinations', 'farmId')})
  LEFT JOIN ${T} at ON at.id = a.${c('animals', 'animalTypeId')}
  LEFT JOIN ${V} v ON v.id = av.${c('vaccinations', 'vaccineId')}`
}

export type VaccinationFiltersLocal = { date?: string; dateFrom?: string; dateTo?: string; farmId?: string; code?: string; animalId?: string }

export function vaccinationsListQuery(filters: VaccinationFiltersLocal, limit?: number): SqlQuery {
  const where: string[] = []
  const params: unknown[] = []
  const applied = `av.${c('vaccinations', 'appliedAt')}`
  if (filters.date) {
    where.push(`substr(${applied}, 1, 10) = ?`)
    params.push(filters.date)
  }
  if (filters.dateFrom) {
    where.push(`substr(${applied}, 1, 10) >= ?`)
    params.push(filters.dateFrom)
  }
  if (filters.dateTo) {
    where.push(`substr(${applied}, 1, 10) <= ?`)
    params.push(filters.dateTo)
  }
  if (filters.farmId) {
    where.push(`COALESCE(a.${c('animals', 'farmId')}, av.${c('vaccinations', 'farmId')}) = ?`)
    params.push(filters.farmId)
  }
  if (filters.animalId) {
    where.push(`av.${c('vaccinations', 'animalId')} = ?`)
    params.push(filters.animalId)
  }
  const code = filters.code?.trim()
  if (code) {
    where.push(`instr(lower(a.${c('animals', 'code')}), lower(?)) > 0`)
    params.push(code)
  }
  params.push(limitClause(limit) + 1)
  return {
    sql: `${vaccinationSelect()} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${applied} DESC, av.id DESC LIMIT ?`,
    params,
  }
}

export function vaccinationByIdQuery(id: string): SqlQuery {
  return { sql: `${vaccinationSelect()} WHERE av.id = ?`, params: [id] }
}

export type VaccinationRow = {
  id: string
  animalId: string
  animalCode: string | null
  farmId: string | null
  farmName: string | null
  animalTypeName: string | null
  vaccineId: string
  vaccineName: string | null
  appliedAt: string
  withdrawalDays: number
  withdrawalUntil: string | null
  createdByUserId: string | null
  createdAt: string | null
  updatedAt: string | null
}

export function rowToVaccination(row: VaccinationRow): VaccinationEntry {
  return {
    id: row.id,
    animalId: row.animalId ?? '',
    animalCode: row.animalCode ?? '',
    farmId: row.farmId ?? '',
    farmName: row.farmName ?? '',
    animalTypeName: row.animalTypeName ?? '',
    vaccineId: row.vaccineId ?? '',
    vaccineName: row.vaccineName ?? '',
    appliedAt: row.appliedAt ? String(row.appliedAt).slice(0, 10) : '',
    withdrawalDays: Number(row.withdrawalDays ?? 0),
    withdrawalUntil: row.withdrawalUntil ? String(row.withdrawalUntil).slice(0, 10) : '',
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

/** Bloco "Carência" do animal: TODAS as aplicações (mais recentes primeiro) + resumo. */
export function animalApplicationsQuery(animalId: string): SqlQuery {
  return {
    sql: `SELECT av.id AS id, av.${c('vaccinations', 'vaccineId')} AS vaccineId, v.${c('vaccines', 'name')} AS vaccineName,
      av.${c('vaccinations', 'appliedAt')} AS appliedAt, av.${c('vaccinations', 'withdrawalDays')} AS withdrawalDays,
      ${untilExpr('av')} AS withdrawalUntil
      FROM ${AV} av LEFT JOIN ${V} v ON v.id = av.${c('vaccinations', 'vaccineId')}
      WHERE av.${c('vaccinations', 'animalId')} = ?
      ORDER BY av.${c('vaccinations', 'appliedAt')} DESC, av.id DESC`,
    params: [animalId],
  }
}

export type ApplicationRow = {
  id: string
  vaccineId: string | null
  vaccineName: string | null
  appliedAt: string
  withdrawalDays: number
  withdrawalUntil: string | null
}

export function rowsToWithdrawal(rows: ApplicationRow[], today: string): AnimalWithdrawal {
  const applications: WithdrawalApplication[] = rows.map((row) => {
    const withdrawalUntil = row.withdrawalUntil ? String(row.withdrawalUntil).slice(0, 10) : ''
    return {
      id: row.id,
      vaccineId: row.vaccineId ?? null,
      vaccineName: row.vaccineName ?? '',
      appliedAt: row.appliedAt ? String(row.appliedAt).slice(0, 10) : '',
      withdrawalDays: Number(row.withdrawalDays ?? 0),
      withdrawalUntil,
      active: isActiveOn(withdrawalUntil, today),
    }
  })
  return { applications, ...summarizeWithdrawal(applications, today) }
}


// ---------- Rebanhos (contrato final: HERDS_CONTRACT) ----------

const herdSelect = `SELECT h.id AS id, h.${c('herds', 'farmId')} AS farmId, f.${c('farms', 'name')} AS farmName,
  h.${c('herds', 'name')} AS name, h.${c('herds', 'description')} AS description,
  h.${c('herds', 'formedAt')} AS formedAt,
  COUNT(a.id) AS animalCount
  FROM ${H} h
  LEFT JOIN ${F} f ON f.id = h.${c('herds', 'farmId')}
  LEFT JOIN ${A} a ON a.${c('animals', 'herdId')} = h.id AND NOT ${animalShippedExpr('a')}`

export type HerdFilters = { farmId?: string; search?: string }

export function herdsListQuery(filters: HerdFilters = {}, limit?: number): SqlQuery {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.farmId) {
    where.push(`h.${c('herds', 'farmId')} = ?`)
    params.push(filters.farmId)
  }
  const search = filters.search?.trim()
  if (search) {
    where.push(`instr(lower(h.${c('herds', 'name')}), lower(?)) > 0`)
    params.push(search)
  }
  params.push(limitClause(limit) + 1)
  return {
    sql: `${herdSelect} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY h.id
      ORDER BY h.${c('herds', 'name')} COLLATE NOCASE, h.id LIMIT ?`,
    params,
  }
}

export function herdByIdQuery(id: string): SqlQuery {
  return { sql: `${herdSelect} WHERE h.id = ? GROUP BY h.id`, params: [id] }
}

export type HerdRow = {
  id: string
  farmId: string
  farmName: string | null
  name: string
  description: string | null
  formedAt: string | null
  animalCount: number
}

export function rowToHerd(row: HerdRow): Herd {
  return {
    id: row.id,
    farmId: row.farmId ?? '',
    farmName: row.farmName ?? undefined,
    name: row.name ?? '',
    description: row.description ?? null,
    formedAt: row.formedAt ? String(row.formedAt).slice(0, 10) : '',
    animalCount: Number(row.animalCount ?? 0),
  }
}

export function herdNameTakenQuery(farmId: string, name: string, excludeId?: string): SqlQuery {
  const nameCol = c('herds', 'name')
  const farmCol = c('herds', 'farmId')
  const nameCmp = HERDS_CONTRACT.nameUniqueCaseInsensitive ? `lower(${nameCol}) = lower(?)` : `${nameCol} = ?`
  const scope = HERDS_CONTRACT.nameUniquePerFarm ? ` AND ${farmCol} = ?` : ''
  const params: unknown[] = HERDS_CONTRACT.nameUniquePerFarm
    ? [name.trim(), farmId, excludeId ?? '']
    : [name.trim(), excludeId ?? '']
  return {
    sql: `SELECT id FROM ${H} WHERE ${nameCmp}${scope} AND id <> ? LIMIT 1`,
    params,
  }
}

// ---------- Embarques (SHIPMENTS_CONTRACT + SHIPMENT_FLOW_CONTRACT, contrato final) ----------

const shipmentSelect = `SELECT s.id AS id, s.${c('shipments', 'farmId')} AS farmId, f.${c('farms', 'name')} AS farmName,
  s.${c('shipments', 'name')} AS name, s.${c('shipments', 'shippedOn')} AS shippedOn,
  COALESCE(s.${c('shipments', 'status')}, 'in_progress') AS status, s.${c('shipments', 'finishedAt')} AS finishedAt,
  COUNT(sa.id) AS animalCount, COALESCE(SUM(sa.${c('shipmentAnimals', 'weightKg')}), 0) AS totalWeightKg
  FROM ${S} s
  LEFT JOIN ${F} f ON f.id = s.${c('shipments', 'farmId')}
  LEFT JOIN ${SA} sa ON sa.${c('shipmentAnimals', 'shipmentId')} = s.id`

/** `when`: proximos = dia do embarque >= hoje; realizados = antes de hoje (hoje vem do JS, fuso do contrato). */
export const SHIPMENT_WHEN = ['proximos', 'realizados'] as const
export type ShipmentWhen = (typeof SHIPMENT_WHEN)[number]
export function isShipmentWhen(value: unknown): value is ShipmentWhen {
  return typeof value === 'string' && (SHIPMENT_WHEN as readonly string[]).includes(value)
}

export type ShipmentFilters = { farmId?: string; search?: string; when?: ShipmentWhen; today?: string; status?: ShipmentStatus }

export function shipmentsListQuery(filters: ShipmentFilters = {}, limit?: number): SqlQuery {
  const where: string[] = []
  const params: unknown[] = []
  const shipped = `s.${c('shipments', 'shippedOn')}`
  if (filters.farmId) {
    where.push(`s.${c('shipments', 'farmId')} = ?`)
    params.push(filters.farmId)
  }
  const search = filters.search?.trim()
  if (search) {
    where.push(`instr(lower(s.${c('shipments', 'name')}), lower(?)) > 0`)
    params.push(search)
  }
  if (filters.status) {
    where.push(`COALESCE(s.${c('shipments', 'status')}, 'in_progress') = ?`)
    params.push(filters.status)
  }
  if (filters.when && filters.today) {
    where.push(filters.when === 'proximos' ? `${shipped} >= ?` : `${shipped} < ?`)
    params.push(filters.today)
  }
  params.push(limitClause(limit) + 1)
  // Próximos: o mais perto primeiro; demais: o mais recente primeiro.
  const order = filters.when === 'proximos' ? `${shipped} ASC` : `${shipped} DESC`
  return {
    sql: `${shipmentSelect} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY s.id
      ORDER BY ${order}, s.${c('shipments', 'name')} COLLATE NOCASE, s.id LIMIT ?`,
    params,
  }
}

export function shipmentByIdQuery(id: string): SqlQuery {
  return { sql: `${shipmentSelect} WHERE s.id = ? GROUP BY s.id`, params: [id] }
}

export type ShipmentRow = {
  id: string
  farmId: string
  farmName: string | null
  name: string
  shippedOn: string | null
  status?: string | null
  finishedAt?: string | null
  animalCount: number
  totalWeightKg?: number | null
}

export function rowToShipment(row: ShipmentRow): Shipment {
  return {
    status: shipmentStatusOf(row.status),
    finishedAt: row.finishedAt ?? null,
    id: row.id,
    farmId: row.farmId ?? '',
    farmName: row.farmName ?? undefined,
    name: row.name ?? '',
    shippedOn: row.shippedOn ? String(row.shippedOn).slice(0, 10) : '',
    animalCount: Number(row.animalCount ?? 0),
    totalWeightKg: Math.round(Number(row.totalWeightKg ?? 0) * 10) / 10,
  }
}

export function shipmentNameTakenQuery(farmId: string, name: string, excludeId?: string): SqlQuery {
  const nameCol = c('shipments', 'name')
  const farmCol = c('shipments', 'farmId')
  const nameCmp = SHIPMENTS_CONTRACT.nameUniqueCaseInsensitive ? `lower(${nameCol}) = lower(?)` : `${nameCol} = ?`
  const scope = SHIPMENTS_CONTRACT.nameUniquePerFarm ? ` AND ${farmCol} = ?` : ''
  const params: unknown[] = SHIPMENTS_CONTRACT.nameUniquePerFarm ? [name.trim(), farmId, excludeId ?? ''] : [name.trim(), excludeId ?? '']
  return { sql: `SELECT id FROM ${S} WHERE ${nameCmp}${scope} AND id <> ? LIMIT 1`, params }
}

/** Vínculos embarque ↔ animal. Filtra por fazenda do animal, por embarque ou por animal. */
export function shipmentLinksQuery(filters: { farmId?: string; shipmentId?: string; animalId?: string }): SqlQuery {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.farmId) {
    where.push(`a.${c('animals', 'farmId')} = ?`)
    params.push(filters.farmId)
  }
  if (filters.shipmentId) {
    where.push(`sa.${c('shipmentAnimals', 'shipmentId')} = ?`)
    params.push(filters.shipmentId)
  }
  if (filters.animalId) {
    where.push(`sa.${c('shipmentAnimals', 'animalId')} = ?`)
    params.push(filters.animalId)
  }
  return {
    sql: `SELECT sa.id AS id, sa.${c('shipmentAnimals', 'animalId')} AS animalId, sa.${c('shipmentAnimals', 'shipmentId')} AS shipmentId,
      s.${c('shipments', 'name')} AS shipmentName, s.${c('shipments', 'shippedOn')} AS shipmentShippedOn
      FROM ${SA} sa
      LEFT JOIN ${S} s ON s.id = sa.${c('shipmentAnimals', 'shipmentId')}
      LEFT JOIN ${A} a ON a.id = sa.${c('shipmentAnimals', 'animalId')}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY sa.id`,
    params,
  }
}

export type ShipmentLinkRow = {
  id: string
  animalId: string
  shipmentId: string
  shipmentName: string | null
  shipmentShippedOn: string | null
}

export type ShipmentPickerFilters = { farmId: string; shipmentId: string; code?: string; situacao?: AnimalSituation }

/**
 * Modal "Adicionar animal": animais cadastrados (não embarcados) da fazenda do embarque que ainda não estão NESTE
 * embarque, com a carência vista NO dia do embarque (só aplicações com applied_at <= shippedOn).
 * Situação no mesmo sentido da lista de Animais, com o dia do embarque no lugar de hoje.
 * Animais em OUTRO embarque em andamento vêm com otherShipmentId/Name (a tela mostra, sem deixar adicionar).
 */
export function shipmentPickerQuery(filters: ShipmentPickerFilters, shippedOn: string, limit?: number): SqlQuery {
  const where: string[] = [`a.${c('animals', 'farmId')} = ?`, `NOT ${animalShippedExpr('a')}`]
  const params: unknown[] = [shippedOn, shippedOn, filters.farmId]
  where.push(`NOT EXISTS (SELECT 1 FROM ${SA} own WHERE own.${c('shipmentAnimals', 'animalId')} = a.id AND own.${c('shipmentAnimals', 'shipmentId')} = ?)`)
  params.push(filters.shipmentId)
  const code = filters.code?.trim()
  if (code) {
    where.push(`instr(lower(a.${c('animals', 'code')}), lower(?)) > 0`)
    params.push(code)
  }
  situationWhere(filters.situacao, shippedOn, where, params)
  params.push(limitClause(limit) + 1)
  const base = animalSelect('?', withdrawalAggAppliedUntil)
  return {
    sql: `SELECT base.*, os.id AS otherShipmentId, os.${c('shipments', 'name')} AS otherShipmentName FROM (${base}
      WHERE ${where.join(' AND ')}) base
      LEFT JOIN ${S} os ON os.id = (SELECT osa.${c('shipmentAnimals', 'shipmentId')} FROM ${SA} osa WHERE osa.${c('shipmentAnimals', 'animalId')} = base.id LIMIT 1)
      ORDER BY base.code COLLATE NOCASE, base.id LIMIT ?`,
    params,
  }
}

export type ShipmentPickerRow = AnimalRow & { otherShipmentId: string | null; otherShipmentName: string | null }

/**
 * Animais NO embarque (vínculos), com peso, foto (local da fila ou do servidor) e a carência no dia do embarque.
 * Inclui embarcados: é aqui que os animais de um embarque finalizado continuam visíveis.
 */
export function shipmentLinkedAnimalsQuery(shipmentId: string, shippedOn: string): SqlQuery {
  return {
    sql: `SELECT sa.id AS linkId, a.id AS animalId, a.${c('animals', 'code')} AS code, at.${c('animalTypes', 'name')} AS animalTypeName,
      sa.${c('shipmentAnimals', 'weightKg')} AS weightKg, sa.${c('shipmentAnimals', 'photoId')} AS photoId,
      q.${PHOTO_QUEUE_TABLE.columns.localUri.name} AS localPhotoUri, q.${PHOTO_QUEUE_TABLE.columns.status.name} AS photoStatus,
      w.freeAt AS freeAt, CASE WHEN w.freeAt IS NOT NULL AND ? < w.freeAt THEN 1 ELSE 0 END AS inWithdrawal
      FROM ${SA} sa
      JOIN ${A} a ON a.id = sa.${c('shipmentAnimals', 'animalId')}
      LEFT JOIN ${T} at ON at.id = a.${c('animals', 'animalTypeId')}
      LEFT JOIN (${withdrawalAggAppliedUntil}) w ON w.aid = a.id
      LEFT JOIN ${PQ} q ON q.id = sa.${c('shipmentAnimals', 'photoId')}
      WHERE sa.${c('shipmentAnimals', 'shipmentId')} = ?
      ORDER BY a.${c('animals', 'code')} COLLATE NOCASE, sa.id`,
    params: [shippedOn, shippedOn, shipmentId],
  }
}

export type ShipmentLinkedAnimalRow = {
  linkId: string
  animalId: string
  code: string | null
  animalTypeName: string | null
  weightKg: number | null
  /** null só em vínculo antigo (antes da foto obrigatória). */
  photoId: string | null
  localPhotoUri: string | null
  photoStatus: string | null
  freeAt: string | null
  inWithdrawal: number
}

/**
 * Relatório (PDF) do embarque: animais do embarque com rebanho, peso e foto (arquivo local da fila ou photo_id).
 * Ordem estável: código (sem diferenciar maiúsculas), depois id do vínculo.
 */
export function shipmentReportAnimalsQuery(shipmentId: string): SqlQuery {
  return {
    sql: `SELECT sa.id AS linkId, a.${c('animals', 'code')} AS code, sa.${c('shipmentAnimals', 'weightKg')} AS weightKg,
      sa.${c('shipmentAnimals', 'photoId')} AS photoId, q.${PHOTO_QUEUE_TABLE.columns.localUri.name} AS localPhotoUri,
      a.${c('animals', 'herdId')} AS herdId, h.${c('herds', 'name')} AS herdName
      FROM ${SA} sa
      JOIN ${A} a ON a.id = sa.${c('shipmentAnimals', 'animalId')}
      LEFT JOIN ${H} h ON h.id = a.${c('animals', 'herdId')}
      LEFT JOIN ${PQ} q ON q.id = sa.${c('shipmentAnimals', 'photoId')}
      WHERE sa.${c('shipmentAnimals', 'shipmentId')} = ?
      ORDER BY a.${c('animals', 'code')} COLLATE NOCASE, sa.id`,
    params: [shipmentId],
  }
}

export type ShipmentReportAnimalRow = {
  linkId: string
  code: string | null
  weightKg: number | null
  photoId: string | null
  localPhotoUri: string | null
  herdId: string | null
  herdName: string | null
}

// ---------- Regras locais (equivalentes baratos dos 409) ----------

export function countQuery(entity: 'animals' | 'vaccinations' | 'herds' | 'shipments', field: string, value: string): SqlQuery {
  const columns: Record<string, string> = {
    'animals.farmId': `${A}.${c('animals', 'farmId')}`,
    'animals.animalTypeId': `${A}.${c('animals', 'animalTypeId')}`,
    'animals.herdId': `${A}.${c('animals', 'herdId')}`,
    'herds.farmId': `${H}.${c('herds', 'farmId')}`,
    'shipments.farmId': `${S}.${c('shipments', 'farmId')}`,
    'vaccinations.vaccineId': `${AV}.${c('vaccinations', 'vaccineId')}`,
    'vaccinations.animalId': `${AV}.${c('vaccinations', 'animalId')}`,
  }
  const column = columns[`${entity}.${field}`]
  if (!column) throw new Error(`countQuery: campo não suportado ${entity}.${field}`)
  return { sql: `SELECT COUNT(*) AS n FROM ${t(entity)} WHERE ${column} = ?`, params: [value] }
}

/** Código duplicado na mesma fazenda (sem diferenciar maiúsculas), ignorando o próprio animal. */
export function animalCodeTakenQuery(farmId: string, code: string, excludeId?: string): SqlQuery {
  return {
    sql: `SELECT id FROM ${A} WHERE ${c('animals', 'farmId')} = ? AND lower(${c('animals', 'code')}) = lower(?) AND id <> ? LIMIT 1`,
    params: [farmId, code.trim(), excludeId ?? ''],
  }
}

/** Nome duplicado (vacinas e tipos são únicos por lower(name) no servidor). */
export function nameTakenQuery(entity: 'vaccines' | 'animalTypes', name: string, excludeId?: string): SqlQuery {
  const nameCol = entity === 'vaccines' ? c('vaccines', 'name') : c('animalTypes', 'name')
  return {
    sql: `SELECT id FROM ${t(entity)} WHERE lower(${nameCol}) = lower(?) AND id <> ? LIMIT 1`,
    params: [name.trim(), excludeId ?? ''],
  }
}

/** Fatia o resultado (LIMIT n+1) em itens + hasMore. */
export function sliceLimit<T>(rows: readonly T[], limit: number): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, limit) as T[], hasMore: rows.length > limit }
}

/** Para `db.getOptional(...querySpread(q))`. */
export function querySpread(query: SqlQuery): [string, unknown[]] {
  return [query.sql, query.params]
}
