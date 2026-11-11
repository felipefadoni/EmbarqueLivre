/**
 * Consultas do Dashboard (SQLite local do PowerSync). Puras, geradas a partir de `mapping.ts`.
 * - O escopo do usuário já vem das streams (admin_all / account / catalogs): nenhum filtro de perfil aqui.
 * - Datas (hoje, início da semana/mês) chegam do JS no fuso do APARELHO. Nunca usar a data atual do SQLite (é UTC).
 * - Regra de carência: em carência se hoje < freeAt; livre NO dia withdrawal_until.
 * - Animais embarcados (embarque finalizado) saíram da fazenda: não entram nas contagens de animais.
 * - Filtro de fazenda nas vacinações = fazenda atual do animal (ou a gravada no lançamento), igual à tela Vacinas.
 */
import { colOf as c, tableOf as t } from './mapping'
import { animalShippedExpr, withdrawalAgg, type SqlQuery } from './queries'

const F = t('farms')
const V = t('vaccines')
const T = t('animalTypes')
const A = t('animals')
const AV = t('vaccinations')

const animalFarm = `a.${c('animals', 'farmId')}`
const applied = `substr(av.${c('vaccinations', 'appliedAt')}, 1, 10)`
const vaccFarm = `COALESCE(a.${c('animals', 'farmId')}, av.${c('vaccinations', 'farmId')})`

function farmWhere(expr: string, farmId: string | undefined, params: unknown[]) {
  if (!farmId) return ''
  params.push(farmId)
  return ` AND ${expr} = ?`
}

export type SituationSummaryRow = {
  total: number
  liberados: number
  emCarencia: number
  semHistorico: number
  libera7: number
  /** Maior freeAt entre os animais em carência (fazenda inteira livre nessa data). */
  allFreeAt: string | null
}

/** Uma consulta só para o anel e os três cartões de situação. */
export function situationSummaryQuery(today: string, farmId?: string): SqlQuery {
  const params: unknown[] = [today, today, today, today, today]
  const where = farmWhere(animalFarm, farmId, params)
  return {
    sql: `SELECT COUNT(*) AS total,
  COALESCE(SUM(CASE WHEN w.freeAt IS NOT NULL AND w.freeAt <= ? THEN 1 ELSE 0 END), 0) AS liberados,
  COALESCE(SUM(CASE WHEN w.freeAt > ? THEN 1 ELSE 0 END), 0) AS emCarencia,
  COALESCE(SUM(CASE WHEN w.aid IS NULL THEN 1 ELSE 0 END), 0) AS semHistorico,
  COALESCE(SUM(CASE WHEN w.freeAt > ? AND w.freeAt <= date(?, '+7 days') THEN 1 ELSE 0 END), 0) AS libera7,
  MAX(CASE WHEN w.freeAt > ? THEN w.freeAt END) AS allFreeAt
  FROM ${A} a LEFT JOIN (${withdrawalAgg}) w ON w.aid = a.id
  WHERE NOT ${animalShippedExpr('a')}${where}`,
    params,
  }
}

export type CountsRow = { farms: number }
export function farmsCountQuery(): SqlQuery {
  return { sql: `SELECT COUNT(*) AS farms FROM ${F}`, params: [] }
}

export type VaccinationCountsRow = { hoje: number; semana: number; mes: number }
/** Vacinações aplicadas hoje, na semana (seg→hoje) e no mês (dia 1→hoje). */
export function vaccinationCountsQuery(today: string, weekStart: string, monthStart: string, farmId?: string): SqlQuery {
  const from = weekStart < monthStart ? weekStart : monthStart
  const params: unknown[] = [today, weekStart, monthStart, from, today]
  const where = farmWhere(vaccFarm, farmId, params)
  return {
    sql: `SELECT COALESCE(SUM(CASE WHEN ${applied} = ? THEN 1 ELSE 0 END), 0) AS hoje,
  COALESCE(SUM(CASE WHEN ${applied} >= ? THEN 1 ELSE 0 END), 0) AS semana,
  COALESCE(SUM(CASE WHEN ${applied} >= ? THEN 1 ELSE 0 END), 0) AS mes
  FROM ${AV} av LEFT JOIN ${A} a ON a.id = av.${c('vaccinations', 'animalId')}
  WHERE ${applied} >= ? AND ${applied} <= ?${where}`,
    params,
  }
}

export type DayCountRow = { day: string; n: number }
/** Vacinações por dia entre `from` e `to` (o JS agrupa em dias/semanas/meses e preenche buracos). */
export function vaccinationsPerDayQuery(from: string, to: string, farmId?: string): SqlQuery {
  const params: unknown[] = [from, to]
  const where = farmWhere(vaccFarm, farmId, params)
  return {
    sql: `SELECT ${applied} AS day, COUNT(*) AS n
  FROM ${AV} av LEFT JOIN ${A} a ON a.id = av.${c('vaccinations', 'animalId')}
  WHERE ${applied} >= ? AND ${applied} <= ?${where}
  GROUP BY ${applied} ORDER BY day`,
    params,
  }
}

export type ReleasingRow = { id: string; code: string; farmName: string | null; freeAt: string }
/** Animais em carência que ficam livres em até 7 dias (lista curta). */
export function releasingSoonQuery(today: string, farmId?: string, limit = 5): SqlQuery {
  const params: unknown[] = [today, today]
  const where = farmWhere(animalFarm, farmId, params)
  params.push(Math.max(1, Math.trunc(limit)))
  return {
    sql: `SELECT a.id AS id, a.${c('animals', 'code')} AS code, f.${c('farms', 'name')} AS farmName, w.freeAt AS freeAt
  FROM ${A} a JOIN (${withdrawalAgg}) w ON w.aid = a.id
  LEFT JOIN ${F} f ON f.id = ${animalFarm}
  WHERE w.freeAt > ? AND w.freeAt <= date(?, '+7 days') AND NOT ${animalShippedExpr('a')}${where}
  ORDER BY w.freeAt, a.${c('animals', 'code')} COLLATE NOCASE, a.id LIMIT ?`,
    params,
  }
}

export type GroupCountRow = { id: string | null; name: string | null; n: number; emCarencia: number }

/** Animais por tipo (com quantos em carência). */
export function animalsByTypeQuery(today: string, farmId?: string): SqlQuery {
  const params: unknown[] = [today]
  const where = farmWhere(animalFarm, farmId, params)
  return {
    sql: `SELECT a.${c('animals', 'animalTypeId')} AS id, at.${c('animalTypes', 'name')} AS name, COUNT(*) AS n,
  COALESCE(SUM(CASE WHEN w.freeAt > ? THEN 1 ELSE 0 END), 0) AS emCarencia
  FROM ${A} a LEFT JOIN ${T} at ON at.id = a.${c('animals', 'animalTypeId')}
  LEFT JOIN (${withdrawalAgg}) w ON w.aid = a.id
  WHERE NOT ${animalShippedExpr('a')}${where}
  GROUP BY a.${c('animals', 'animalTypeId')} ORDER BY n DESC, name COLLATE NOCASE`,
    params,
  }
}

/** Animais por fazenda (todas as fazendas do escopo, inclusive as sem animais). */
export function animalsByFarmQuery(today: string): SqlQuery {
  return {
    sql: `SELECT f.id AS id, f.${c('farms', 'name')} AS name, COUNT(a.id) AS n,
  COALESCE(SUM(CASE WHEN w.freeAt > ? THEN 1 ELSE 0 END), 0) AS emCarencia
  FROM ${F} f LEFT JOIN ${A} a ON ${animalFarm} = f.id AND NOT ${animalShippedExpr('a')}
  LEFT JOIN (${withdrawalAgg}) w ON w.aid = a.id
  GROUP BY f.id ORDER BY n DESC, name COLLATE NOCASE`,
    params: [today],
  }
}

export type TopVaccineRow = { id: string; name: string | null; n: number }
/** Vacinas mais usadas desde `since` (ex.: últimos 30 dias). */
export function topVaccinesQuery(since: string, today: string, farmId?: string, limit = 3): SqlQuery {
  const params: unknown[] = [since, today]
  const where = farmWhere(vaccFarm, farmId, params)
  params.push(Math.max(1, Math.trunc(limit)))
  return {
    sql: `SELECT av.${c('vaccinations', 'vaccineId')} AS id, v.${c('vaccines', 'name')} AS name, COUNT(*) AS n
  FROM ${AV} av LEFT JOIN ${A} a ON a.id = av.${c('vaccinations', 'animalId')}
  LEFT JOIN ${V} v ON v.id = av.${c('vaccinations', 'vaccineId')}
  WHERE ${applied} >= ? AND ${applied} <= ?${where}
  GROUP BY av.${c('vaccinations', 'vaccineId')} ORDER BY n DESC, name COLLATE NOCASE LIMIT ?`,
    params,
  }
}
