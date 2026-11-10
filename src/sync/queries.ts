/**
 * Consultas SQL locais (PowerSync/SQLite). Tudo gerado a partir de `mapping.ts`.
 * Cada builder devolve { sql, params } com colunas apelidadas para os nomes de campo do app,
 * e os mappers convertem a linha nos tipos já usados pelas telas.
 * Puro (sem React Native) para testes no Node com SQLite real.
 */
import type { Animal, AnimalType, Farm, Vaccine } from '../api/catalog'
import type { AnimalWithdrawal, VaccinationEntry, WithdrawalApplication } from '../api/contract'
import { colOf as c, tableOf as t } from './mapping'
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

/** Data efetiva de fim de carência: a gravada; se ausente, applied_at + days no SQLite. */
function untilExpr(alias: string) {
  return `COALESCE(${alias}.${c('vaccinations', 'withdrawalUntil')}, date(${alias}.${c('vaccinations', 'appliedAt')}, '+' || ${alias}.${c('vaccinations', 'withdrawalDays')} || ' days'))`
}

function limitClause(limit: number | undefined) {
  return Math.max(1, Math.trunc(limit ?? LOCAL_PAGE_SIZE))
}

// ---------- Fazendas ----------

const farmSelect = `SELECT f.id AS id, f.${c('farms', 'ownerUserId')} AS ownerUserId, f.${c('farms', 'name')} AS name,
  f.${c('farms', 'city')} AS city, f.${c('farms', 'state')} AS state
  FROM ${F} f`

export function farmsListQuery(limit?: number): SqlQuery {
  return { sql: `${farmSelect} ORDER BY f.${c('farms', 'name')} COLLATE NOCASE, f.id LIMIT ?`, params: [limitClause(limit) + 1] }
}

export function farmByIdQuery(id: string): SqlQuery {
  return { sql: `${farmSelect} WHERE f.id = ?`, params: [id] }
}

/** Sem tabela de usuários no sync: o nome do dono só vem do REST (GET /farms/:id), online. */
export type FarmRow = { id: string; ownerUserId: string | null; name: string; city: string; state: string }

export function rowToFarm(row: FarmRow): Farm {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId ?? '',
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

function animalSelect(todayParam = '?') {
  return `SELECT a.id AS id, a.${c('animals', 'code')} AS code, a.${c('animals', 'farmId')} AS farmId,
  a.${c('animals', 'animalTypeId')} AS animalTypeId, a.${c('animals', 'sex')} AS sex, a.${c('animals', 'breed')} AS breed,
  a.${c('animals', 'birthDate')} AS birthDate, f.${c('farms', 'name')} AS farmName, at.${c('animalTypes', 'name')} AS animalTypeName,
  COALESCE(w.total, 0) AS totalWithdrawalDays, w.freeAt AS freeAt,
  CASE WHEN w.freeAt IS NOT NULL AND ${todayParam} < w.freeAt THEN 1 ELSE 0 END AS inWithdrawal
  FROM ${A} a
  LEFT JOIN ${F} f ON f.id = a.${c('animals', 'farmId')}
  LEFT JOIN ${T} at ON at.id = a.${c('animals', 'animalTypeId')}
  LEFT JOIN (${withdrawalAgg}) w ON w.aid = a.id`
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

export type AnimalFilters = { farmId?: string; animalTypeId?: string; code?: string; situacao?: AnimalSituation }

export function animalsListQuery(filters: AnimalFilters, today: string, limit?: number): SqlQuery {
  const where: string[] = []
  const params: unknown[] = [today]
  if (filters.farmId) {
    where.push(`a.${c('animals', 'farmId')} = ?`)
    params.push(filters.farmId)
  }
  if (filters.animalTypeId) {
    where.push(`a.${c('animals', 'animalTypeId')} = ?`)
    params.push(filters.animalTypeId)
  }
  const code = filters.code?.trim()
  if (code) {
    // Parcial e sem diferenciar maiúsculas; instr evita tratar % e _ como curingas.
    where.push(`instr(lower(a.${c('animals', 'code')}), lower(?)) > 0`)
    params.push(code)
  }
  // `today` vem do JS (fuso do aparelho); date(?, '+7 days') só soma dias a essa data (nunca a data atual do SQLite, que é UTC).
  if (filters.situacao === 'liberado') {
    where.push('w.freeAt IS NOT NULL AND w.freeAt <= ?')
    params.push(today)
  } else if (filters.situacao === 'carencia') {
    where.push('w.freeAt > ?')
    params.push(today)
  } else if (filters.situacao === 'sem_historico') {
    where.push('w.aid IS NULL')
  } else if (filters.situacao === 'libera7') {
    where.push("w.freeAt > ? AND w.freeAt <= date(?, '+7 days')")
    params.push(today, today)
  }
  params.push(limitClause(limit) + 1)
  const order = filters.situacao === 'libera7' ? 'w.freeAt, ' : ''
  return {
    sql: `${animalSelect()} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}a.${c('animals', 'code')} COLLATE NOCASE, a.id LIMIT ?`,
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
  farmName: string | null
  animalTypeName: string | null
  totalWithdrawalDays: number
  freeAt: string | null
  inWithdrawal: number
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

// ---------- Regras locais (equivalentes baratos dos 409) ----------

export function countQuery(entity: 'animals' | 'vaccinations', field: string, value: string): SqlQuery {
  const columns: Record<string, string> = {
    'animals.farmId': `${A}.${c('animals', 'farmId')}`,
    'animals.animalTypeId': `${A}.${c('animals', 'animalTypeId')}`,
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
