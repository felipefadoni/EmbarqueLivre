/**
 * Escritas locais (create/edit/delete) no SQLite do PowerSync + validações locais.
 *
 * - Cada escrita entra na fila de upload do PowerSync (ps_crud) e é enviada quando houver conexão.
 * - IDs: ULID em MAIÚSCULAS gerado no app.
 * - Erros locais usam o MESMO formato de ApiError (status/code) para reaproveitar o mapa pt-BR de errors.ts.
 * - Regras locais baratas equivalentes aos 409 do servidor: dependentes antes de excluir,
 *   código único por fazenda, nome único de vacina/tipo. O servidor continua sendo a palavra final.
 *
 * Puro (sem React Native): recebe um executor SQL (PowerSyncDatabase no app; node:sqlite nos testes).
 */
import type { ApiError, UserRole } from '../api/types'
import { tableOf as t, toColumns, type SyncEntity } from './mapping'
import {
  animalByIdQuery,
  animalCodeTakenQuery,
  countQuery,
  nameTakenQuery,
  vaccineByIdQuery,
  vaccinationByIdQuery,
  type AnimalRow,
  type VaccinationRow,
} from './queries'
import { computeWithdrawalUntil } from './withdrawal'

export interface SqlExecutor {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
  execute(sql: string, params?: unknown[]): Promise<unknown>
  writeTransaction?<R>(fn: (tx: Pick<SqlExecutor, 'getAll' | 'getOptional' | 'execute'>) => Promise<R>): Promise<R>
}

export type RepositoryContext = {
  db: SqlExecutor
  newId: () => string
  /** ISO timestamp (UTC). */
  now: () => string
  /** YYYY-MM-DD local. */
  today: () => string
  currentUser: () => { id: string; role: UserRole } | null
}

export function localError(status: number, code: string, field?: string): ApiError {
  return { status, code, fieldErrors: field ? { [field]: [code] } : undefined, details: field ? { field } : undefined }
}

function insertSql(entity: SyncEntity, id: string, values: Record<string, unknown>) {
  const columns = Object.keys(values)
  return {
    sql: `INSERT INTO ${t(entity)} (id${columns.map((name) => `, ${name}`).join('')}) VALUES (?${columns.map(() => ', ?').join('')})`,
    params: [id, ...columns.map((name) => values[name] ?? null)],
  }
}

function updateSql(entity: SyncEntity, id: string, values: Record<string, unknown>) {
  const columns = Object.keys(values)
  return {
    sql: `UPDATE ${t(entity)} SET ${columns.map((name) => `${name} = ?`).join(', ')} WHERE id = ?`,
    params: [...columns.map((name) => values[name] ?? null), id],
  }
}

async function count(db: SqlExecutor, query: { sql: string; params: unknown[] }) {
  const row = await db.getOptional<{ n: number }>(query.sql, query.params)
  return Number(row?.n ?? 0)
}

export type FarmInput = { name: string; city: string; state: string; accountId?: string; /** @deprecated use accountId */ ownerUserId?: string }
export type VaccineInput = { name: string; withdrawalDays: number }
export type AnimalTypeInput = { name: string }
export type AnimalInput = {
  code: string
  farmId: string
  animalTypeId: string
  sex: 'M' | 'F' | null
  breed: string | null
  birthDate: string | null
}
export type VaccinationInput = { animalId: string; vaccineId: string; appliedAt?: string }

export function createRepository(ctx: RepositoryContext) {
  const { db } = ctx
  const id = () => ctx.newId().toUpperCase()

  async function run(query: { sql: string; params: unknown[] }) {
    await db.execute(query.sql, query.params)
  }

  return {
    // ----- Fazendas -----
    async createFarm(input: FarmInput) {
      const user = ctx.currentUser()
      const newId = id()
      const values = toColumns('farms', {
        name: input.name.trim(),
        city: input.city.trim(),
        state: input.state,
        // Admin escolhe a conta; master/basic: o servidor atribui à conta de quem cria (não enviar).
        accountId: user?.role === 'admin' ? (input.accountId || input.ownerUserId) : undefined,
        createdAt: ctx.now(),
        updatedAt: ctx.now(),
      })
      await run(insertSql('farms', newId, values))
      return newId
    },
    async updateFarm(farmId: string, input: FarmInput) {
      // A conta não muda por PATCH: nunca enviar account_id / owner_user_id aqui.
      const values = toColumns('farms', { name: input.name.trim(), city: input.city.trim(), state: input.state, updatedAt: ctx.now() })
      await run(updateSql('farms', farmId, values))
    },
    async deleteFarm(farmId: string) {
      if ((await count(db, countQuery('animals', 'farmId', farmId))) > 0) throw localError(409, 'FARM_HAS_ANIMALS')
      await run({ sql: `DELETE FROM ${t('farms')} WHERE id = ?`, params: [farmId] })
    },

    // ----- Vacinas -----
    async createVaccine(input: VaccineInput) {
      const name = input.name.trim()
      if (await db.getOptional(...spread(nameTakenQuery('vaccines', name)))) throw localError(409, 'VACCINE_NAME_ALREADY_EXISTS', 'name')
      const newId = id()
      await run(insertSql('vaccines', newId, toColumns('vaccines', { name, withdrawalDays: input.withdrawalDays, createdAt: ctx.now(), updatedAt: ctx.now() })))
      return newId
    },
    async updateVaccine(vaccineId: string, input: VaccineInput) {
      const name = input.name.trim()
      if (await db.getOptional(...spread(nameTakenQuery('vaccines', name, vaccineId)))) throw localError(409, 'VACCINE_NAME_ALREADY_EXISTS', 'name')
      await run(updateSql('vaccines', vaccineId, toColumns('vaccines', { name, withdrawalDays: input.withdrawalDays, updatedAt: ctx.now() })))
    },
    async deleteVaccine(vaccineId: string) {
      if ((await count(db, countQuery('vaccinations', 'vaccineId', vaccineId))) > 0) throw localError(409, 'VACCINE_HAS_APPLICATIONS')
      await run({ sql: `DELETE FROM ${t('vaccines')} WHERE id = ?`, params: [vaccineId] })
    },

    // ----- Tipos de animais -----
    async createAnimalType(input: AnimalTypeInput) {
      const name = input.name.trim()
      if (await db.getOptional(...spread(nameTakenQuery('animalTypes', name)))) throw localError(409, 'ANIMAL_TYPE_NAME_ALREADY_EXISTS', 'name')
      const newId = id()
      await run(insertSql('animalTypes', newId, toColumns('animalTypes', { name, createdAt: ctx.now(), updatedAt: ctx.now() })))
      return newId
    },
    async updateAnimalType(typeId: string, input: AnimalTypeInput) {
      const name = input.name.trim()
      if (await db.getOptional(...spread(nameTakenQuery('animalTypes', name, typeId)))) throw localError(409, 'ANIMAL_TYPE_NAME_ALREADY_EXISTS', 'name')
      await run(updateSql('animalTypes', typeId, toColumns('animalTypes', { name, updatedAt: ctx.now() })))
    },
    async deleteAnimalType(typeId: string) {
      if ((await count(db, countQuery('animals', 'animalTypeId', typeId))) > 0) throw localError(409, 'ANIMAL_TYPE_HAS_ANIMALS')
      await run({ sql: `DELETE FROM ${t('animalTypes')} WHERE id = ?`, params: [typeId] })
    },

    // ----- Animais -----
    async createAnimal(input: AnimalInput) {
      const code = input.code.trim()
      if (await db.getOptional(...spread(animalCodeTakenQuery(input.farmId, code)))) {
        throw localError(409, 'ANIMAL_CODE_ALREADY_EXISTS', 'code')
      }
      const newId = id()
      await run(
        insertSql('animals', newId, toColumns('animals', {
          code,
          farmId: input.farmId,
          animalTypeId: input.animalTypeId,
          sex: input.sex,
          breed: input.breed,
          birthDate: input.birthDate,
          createdAt: ctx.now(),
          updatedAt: ctx.now(),
        })),
      )
      return newId
    },
    async updateAnimal(animalId: string, input: AnimalInput) {
      const code = input.code.trim()
      if (await db.getOptional(...spread(animalCodeTakenQuery(input.farmId, code, animalId)))) {
        throw localError(409, 'ANIMAL_CODE_ALREADY_EXISTS', 'code')
      }
      await run(
        updateSql('animals', animalId, toColumns('animals', {
          code,
          farmId: input.farmId,
          animalTypeId: input.animalTypeId,
          sex: input.sex,
          breed: input.breed,
          birthDate: input.birthDate,
          updatedAt: ctx.now(),
        })),
      )
    },
    async deleteAnimal(animalId: string) {
      if ((await count(db, countQuery('vaccinations', 'animalId', animalId))) > 0) throw localError(409, 'ANIMAL_HAS_VACCINATIONS')
      await run({ sql: `DELETE FROM ${t('animals')} WHERE id = ?`, params: [animalId] })
    },

    // ----- Lançamentos de vacina -----
    async createVaccination(input: VaccinationInput) {
      const today = ctx.today()
      const appliedAt = input.appliedAt || today
      if (appliedAt > today || appliedAt < '1900-01-01') throw localError(400, 'INVALID_APPLIED_AT', 'appliedAt')
      const animal = await db.getOptional<AnimalRow>(...spread(animalByIdQuery(input.animalId, today)))
      if (!animal) throw localError(404, 'ANIMAL_NOT_FOUND', 'animalId')
      const vaccine = await db.getOptional<{ id: string; withdrawalDays: number }>(...spread(vaccineByIdQuery(input.vaccineId)))
      if (!vaccine) throw localError(404, 'VACCINE_NOT_FOUND', 'vaccineId')
      const days = Number(vaccine.withdrawalDays ?? 0)
      const newId = id()
      await run(
        insertSql('vaccinations', newId, toColumns('vaccinations', {
          animalId: input.animalId,
          farmId: animal.farmId,
          vaccineId: input.vaccineId,
          appliedAt,
          withdrawalDays: days,
          withdrawalUntil: computeWithdrawalUntil(appliedAt, days),
          createdByUserId: ctx.currentUser()?.id ?? null,
          createdAt: ctx.now(),
          updatedAt: ctx.now(),
        })),
      )
      return newId
    },
    async updateVaccination(vaccinationId: string, input: VaccinationInput) {
      const today = ctx.today()
      const current = await db.getOptional<VaccinationRow>(...spread(vaccinationByIdQuery(vaccinationId)))
      if (!current) throw localError(404, 'VACCINATION_NOT_FOUND')
      const appliedAt = input.appliedAt || String(current.appliedAt).slice(0, 10)
      if (appliedAt > today || appliedAt < '1900-01-01') throw localError(400, 'INVALID_APPLIED_AT', 'appliedAt')
      const changes: Record<string, unknown> = { appliedAt, updatedAt: ctx.now() }
      let days = Number(current.withdrawalDays ?? 0)
      if (input.animalId && input.animalId !== current.animalId) {
        const animal = await db.getOptional<AnimalRow>(...spread(animalByIdQuery(input.animalId, today)))
        if (!animal) throw localError(404, 'ANIMAL_NOT_FOUND', 'animalId')
        changes.animalId = input.animalId
        changes.farmId = animal.farmId
      }
      if (input.vaccineId && input.vaccineId !== current.vaccineId) {
        // Outra vacina: recalcula com a carência ATUAL dela (mesma vacina mantém a cópia).
        const vaccine = await db.getOptional<{ withdrawalDays: number }>(...spread(vaccineByIdQuery(input.vaccineId)))
        if (!vaccine) throw localError(404, 'VACCINE_NOT_FOUND', 'vaccineId')
        days = Number(vaccine.withdrawalDays ?? 0)
        changes.vaccineId = input.vaccineId
        changes.withdrawalDays = days
      }
      changes.withdrawalUntil = computeWithdrawalUntil(appliedAt, days)
      await run(updateSql('vaccinations', vaccinationId, toColumns('vaccinations', changes)))
    },
    async deleteVaccination(vaccinationId: string) {
      await run({ sql: `DELETE FROM ${t('vaccinations')} WHERE id = ?`, params: [vaccinationId] })
    },
  }
}

function spread(query: { sql: string; params: unknown[] }): [string, unknown[]] {
  return [query.sql, query.params]
}

export type LocalRepository = ReturnType<typeof createRepository>

