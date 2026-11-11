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
import { HERDS_CONTRACT, isValidHerdFormedAt, normalizeHerdDescription, todayIsoInHerdZone } from '../api/herdsContract'
import {
  isValidShipmentName,
  isValidShippedOn,
  isValidWeightKg,
  parseWeightKg,
  SHIPMENT_FLOW_CONTRACT,
  SHIPMENTS_CONTRACT,
  shipmentStatusOf,
  todayIsoInShipmentZone,
} from '../api/shipmentsContract'
import type { ApiError, UserRole } from '../api/types'
import { colOf as col, PHOTO_QUEUE_TABLE, tableOf as t, toColumns, type SyncEntity } from './mapping'
import {
  animalByIdQuery,
  animalCodeTakenQuery,
  countQuery,
  farmByIdQuery,
  herdByIdQuery,
  herdNameTakenQuery,
  nameTakenQuery,
  shipmentAnimalsQuery,
  shipmentByIdQuery,
  shipmentNameTakenQuery,
  vaccineByIdQuery,
  vaccinationByIdQuery,
  type AnimalRow,
  type FarmRow,
  type HerdRow,
  type ShipmentRow,
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
  herdId?: string | null
}
export type HerdInput = { farmId: string; name: string; description?: string | null; formedAt: string }
export type VaccinationInput = { animalId: string; vaccineId: string; appliedAt?: string }
export type ShipmentInput = { farmId: string; name: string; shippedOn: string }
/** Nome e data (só Em andamento). A fazenda não muda. Carência não bloqueia (só aviso no app). Sem `animalIds`. */
export type ShipmentUpdate = { name: string; shippedOn: string; farmId?: string }
/**
 * Animal novo no embarque: peso (kg, 1–2000, 1 casa) e foto (arquivo local já comprimido) obrigatórios.
 * Carência no dia do embarque NÃO bloqueia: o app avisa e pede confirmação antes de chamar.
 */
export type ShipmentAnimalInput = {
  animalId: string
  weightKg: number | string | null | undefined
  /** URI local (file://) da foto comprimida, guardada pelo app. Obrigatória. */
  photoUri: string | null | undefined
}
export type ShipmentAnimalUpdate = { weightKg?: number | string | null; photoUri?: string | null }

export function createRepository(ctx: RepositoryContext) {
  const { db } = ctx
  const id = () => ctx.newId().toUpperCase()

  function assertCanWrite(entity: 'farms' | 'herds' | 'vaccines' | 'animalTypes') {
    const role = ctx.currentUser()?.role
    const allowed = entity === 'animalTypes' ? role === 'admin' : role === 'master' || role === 'admin'
    if (allowed) return
    throw { ...localError(403, 'INSUFFICIENT_ROLE'), message: 'Você não tem permissão para executar esta ação' }
  }

  /** Embarques: cadastrar/editar (nome, data, lista) = basic, master e admin; excluir = só master e admin. */
  function assertCanShipment(action: 'write' | 'delete') {
    const role = ctx.currentUser()?.role
    const allowed = action === 'delete' ? role === 'master' || role === 'admin' : role === 'basic' || role === 'master' || role === 'admin'
    if (allowed) return
    throw { ...localError(403, 'INSUFFICIENT_ROLE'), message: 'Você não tem permissão para executar esta ação' }
  }

  const SA = t('shipmentAnimals')
  const saShipment = col('shipmentAnimals', 'shipmentId')
  const saAnimal = col('shipmentAnimals', 'animalId')

  function shipmentError(status: number, code: string, field: string, extra: Record<string, unknown>): ApiError {
    const base = localError(status, code, field)
    return { ...base, details: { field, ...extra } }
  }

  const PQ = PHOTO_QUEUE_TABLE.table
  const pq = PHOTO_QUEUE_TABLE.columns

  /**
   * Validação de um animal novo no embarque, na ordem do backend (§17.11, slice 2; o embarque em andamento já foi
   * conferido por `openShipment`): ANIMAL_NOT_FOUND → SHIPMENT_ANIMAL_FARM_MISMATCH → ANIMAL_ALREADY_SHIPPED →
   * ANIMAL_ALREADY_IN_SHIPMENT (`conflicts`; uma linha por animal, inclusive no mesmo embarque). Carência não entra:
   * é só aviso (SHIPMENT_ANIMAL_IN_WITHDRAWAL deixou de existir).
   */
  async function assertShipmentAnimal(exec: SqlExecutor, farmId: string, shippedOn: string, animalId: string) {
    const row = await exec.getOptional<AnimalRow>(...spread(shipmentAnimalsQuery({ animalId }, shippedOn)))
    if (!row) throw shipmentError(404, SHIPMENTS_CONTRACT.errors.animalNotFound, 'animalId', { animalIds: [animalId] })
    if (row.farmId !== farmId) throw shipmentError(422, SHIPMENTS_CONTRACT.errors.animalFarmMismatch, 'animalId', { animalIds: [animalId] })
    if (Number(row.shipped ?? 0) === 1) {
      throw shipmentError(409, SHIPMENT_FLOW_CONTRACT.errors.animalAlreadyShipped, 'animalId', { animalIds: [animalId] })
    }
    const other = await exec.getOptional<{ shipmentId: string }>(`SELECT ${saShipment} AS shipmentId FROM ${SA} WHERE ${saAnimal} = ? LIMIT 1`, [animalId])
    if (other) {
      throw shipmentError(409, SHIPMENTS_CONTRACT.errors.animalAlreadyInShipment, 'animalId', {
        animalIds: [animalId],
        conflicts: [{ animalId, shipmentId: other.shipmentId }],
      })
    }
  }

  /** Embarque existente e EM ANDAMENTO (finalizado é só leitura: 422 SHIPMENT_FINISHED). */
  async function openShipment(exec: SqlExecutor, shipmentId: string): Promise<ShipmentRow> {
    const current = await exec.getOptional<ShipmentRow>(...spread(shipmentByIdQuery(shipmentId)))
    if (!current) throw localError(404, SHIPMENTS_CONTRACT.errors.notFound)
    if (shipmentStatusOf(current.status) === 'finished') throw localError(422, SHIPMENT_FLOW_CONTRACT.errors.finished)
    return current
  }

  function normalizeWeight(raw: number | string | null | undefined): number {
    const value = typeof raw === 'number' ? (isValidWeightKg(raw) ? raw : null) : parseWeightKg(raw)
    if (value == null) throw localError(400, SHIPMENT_FLOW_CONTRACT.errors.invalidWeight, 'weightKg')
    return value
  }

  function requirePhoto(uri: string | null | undefined): string {
    const value = (uri ?? '').trim()
    if (!value) throw localError(400, SHIPMENT_FLOW_CONTRACT.errors.photoRequired, 'photo')
    return value
  }

  /**
   * Foto nova na fila local (id = photo_id gerado aqui, o mesmo gravado no vínculo). Mesma transação do vínculo.
   * Trocar a foto remove a linha antiga da fila (o arquivo vira órfão e é limpo depois).
   */
  async function queuePhoto(exec: SqlExecutor, linkId: string, shipmentId: string, animalId: string, uri: string): Promise<string> {
    const photoId = id()
    await run({ sql: `DELETE FROM ${PQ} WHERE ${pq.linkId.name} = ?`, params: [linkId] }, exec)
    await run(
      {
        sql: `INSERT INTO ${PQ} (id, ${pq.shipmentId.name}, ${pq.animalId.name}, ${pq.linkId.name}, ${pq.localUri.name}, ${pq.status.name}, ${pq.attempts.name}, ${pq.lastError.name}, ${pq.createdAt.name}, ${pq.updatedAt.name})
          VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, ?, ?)`,
        params: [photoId, shipmentId, animalId, linkId, uri, ctx.now(), ctx.now()],
      },
      exec,
    )
    return photoId
  }

  async function deleteLink(exec: SqlExecutor, linkId: string) {
    await run({ sql: `DELETE FROM ${PQ} WHERE ${pq.linkId.name} = ?`, params: [linkId] }, exec)
    await run({ sql: `DELETE FROM ${SA} WHERE id = ?`, params: [linkId] }, exec)
  }

  /** Vínculos do animal com o status do embarque. */
  async function linksOfAnimal(exec: SqlExecutor, animalId: string) {
    return exec.getAll<{ id: string; status: string | null }>(
      `SELECT sa.id AS id, s.${col('shipments', 'status')} AS status FROM ${SA} sa
        LEFT JOIN ${t('shipments')} s ON s.id = sa.${saShipment} WHERE sa.${saAnimal} = ?`,
      [animalId],
    )
  }

  /** Desvincula o animal (excluir animal: CASCADE no servidor, inclusive de embarque finalizado). */
  async function unlinkAnimalFromShipments(exec: SqlExecutor, animalId: string) {
    if (!SHIPMENTS_CONTRACT.unlinkOnAnimalDeleteOrFarmChange) return
    for (const link of await linksOfAnimal(exec, animalId)) await deleteLink(exec, link.id)
  }

  async function run(query: { sql: string; params: unknown[] }, exec: SqlExecutor = db) {
    await exec.execute(query.sql, query.params)
  }

  function asExecutor(raw: Pick<SqlExecutor, 'execute'> & Partial<SqlExecutor>): SqlExecutor {
    return {
      execute: (sql, params) => raw.execute(sql, params),
      getAll: raw.getAll ? raw.getAll.bind(raw) : db.getAll.bind(db),
      getOptional: raw.getOptional ? raw.getOptional.bind(raw) : db.getOptional.bind(db),
    }
  }

  /** Uma transação PowerSync = um lote na fila, na ordem das escritas (rebanho antes dos animais). */
  async function withWrite<T>(fn: (exec: SqlExecutor) => Promise<T>): Promise<T> {
    if (typeof db.writeTransaction === 'function') {
      return db.writeTransaction((tx) => fn(asExecutor(tx)))
    }
    return fn(db)
  }

  async function linkAnimalsToHerd(exec: SqlExecutor, herdId: string, farmId: string, animalIds: string[]) {
    const today = ctx.today()
    for (const animalId of animalIds) {
      const animal = await exec.getOptional<AnimalRow>(...spread(animalByIdQuery(animalId, today)))
      if (!animal) throw localError(404, 'ANIMAL_NOT_FOUND')
      if (animal.farmId !== farmId) throw localError(422, HERDS_CONTRACT.errors.farmMismatch, 'herdId')
      if (animal.herdId === herdId) continue
      await run(updateSql('animals', animalId, toColumns('animals', { herdId, updatedAt: ctx.now() })), exec)
    }
  }

  async function assertHerdFarm(farmId: string, herdId: string | null | undefined): Promise<string | null> {
    const value = herdId?.trim() || null
    if (!value) return null
    const herd = await db.getOptional<HerdRow>(...spread(herdByIdQuery(value)))
    if (!herd) throw localError(404, HERDS_CONTRACT.errors.notFound, 'herdId')
    if (herd.farmId !== farmId) throw localError(422, HERDS_CONTRACT.errors.farmMismatch, 'herdId')
    return value
  }

  return {
    // ----- Fazendas -----
    async createFarm(input: FarmInput) {
      assertCanWrite('farms')
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
      assertCanWrite('farms')
      // A conta não muda por PATCH: nunca enviar account_id / owner_user_id aqui.
      const values = toColumns('farms', { name: input.name.trim(), city: input.city.trim(), state: input.state, updatedAt: ctx.now() })
      await run(updateSql('farms', farmId, values))
    },
    async deleteFarm(farmId: string) {
      assertCanWrite('farms')
      if ((await count(db, countQuery('animals', 'farmId', farmId))) > 0) throw localError(409, 'FARM_HAS_ANIMALS')
      if ((await count(db, countQuery('herds', 'farmId', farmId))) > 0) throw localError(409, HERDS_CONTRACT.errors.farmHasHerds)
      if ((await count(db, countQuery('shipments', 'farmId', farmId))) > 0) throw localError(409, SHIPMENTS_CONTRACT.errors.farmHasShipments)
      await run({ sql: `DELETE FROM ${t('farms')} WHERE id = ?`, params: [farmId] })
    },

    // ----- Vacinas -----
    async createVaccine(input: VaccineInput) {
      assertCanWrite('vaccines')
      const name = input.name.trim()
      if (await db.getOptional(...spread(nameTakenQuery('vaccines', name)))) throw localError(409, 'VACCINE_NAME_ALREADY_EXISTS', 'name')
      const newId = id()
      await run(insertSql('vaccines', newId, toColumns('vaccines', { name, withdrawalDays: input.withdrawalDays, createdAt: ctx.now(), updatedAt: ctx.now() })))
      return newId
    },
    async updateVaccine(vaccineId: string, input: VaccineInput) {
      assertCanWrite('vaccines')
      const name = input.name.trim()
      if (await db.getOptional(...spread(nameTakenQuery('vaccines', name, vaccineId)))) throw localError(409, 'VACCINE_NAME_ALREADY_EXISTS', 'name')
      await run(updateSql('vaccines', vaccineId, toColumns('vaccines', { name, withdrawalDays: input.withdrawalDays, updatedAt: ctx.now() })))
    },
    async deleteVaccine(vaccineId: string) {
      assertCanWrite('vaccines')
      if ((await count(db, countQuery('vaccinations', 'vaccineId', vaccineId))) > 0) throw localError(409, 'VACCINE_HAS_APPLICATIONS')
      await run({ sql: `DELETE FROM ${t('vaccines')} WHERE id = ?`, params: [vaccineId] })
    },

    // ----- Tipos de animais -----
    async createAnimalType(input: AnimalTypeInput) {
      assertCanWrite('animalTypes')
      const name = input.name.trim()
      if (await db.getOptional(...spread(nameTakenQuery('animalTypes', name)))) throw localError(409, 'ANIMAL_TYPE_NAME_ALREADY_EXISTS', 'name')
      const newId = id()
      await run(insertSql('animalTypes', newId, toColumns('animalTypes', { name, createdAt: ctx.now(), updatedAt: ctx.now() })))
      return newId
    },
    async updateAnimalType(typeId: string, input: AnimalTypeInput) {
      assertCanWrite('animalTypes')
      const name = input.name.trim()
      if (await db.getOptional(...spread(nameTakenQuery('animalTypes', name, typeId)))) throw localError(409, 'ANIMAL_TYPE_NAME_ALREADY_EXISTS', 'name')
      await run(updateSql('animalTypes', typeId, toColumns('animalTypes', { name, updatedAt: ctx.now() })))
    },
    async deleteAnimalType(typeId: string) {
      assertCanWrite('animalTypes')
      if ((await count(db, countQuery('animals', 'animalTypeId', typeId))) > 0) throw localError(409, 'ANIMAL_TYPE_HAS_ANIMALS')
      await run({ sql: `DELETE FROM ${t('animalTypes')} WHERE id = ?`, params: [typeId] })
    },

    // ----- Animais -----
    async createAnimal(input: AnimalInput) {
      const code = input.code.trim()
      if (await db.getOptional(...spread(animalCodeTakenQuery(input.farmId, code)))) {
        throw localError(409, 'ANIMAL_CODE_ALREADY_EXISTS', 'code')
      }
      const herdId = await assertHerdFarm(input.farmId, input.herdId)
      const newId = id()
      await run(
        insertSql('animals', newId, toColumns('animals', {
          code,
          farmId: input.farmId,
          animalTypeId: input.animalTypeId,
          sex: input.sex,
          breed: input.breed,
          birthDate: input.birthDate,
          herdId,
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
      const herdId = await assertHerdFarm(input.farmId, input.herdId)
      const before = await db.getOptional<AnimalRow>(...spread(animalByIdQuery(animalId, ctx.today())))
      const farmChanged = Boolean(before && before.farmId !== input.farmId)
      // Trocar de fazenda: sai do embarque em andamento na mesma transação (como o servidor); se o embarque estiver
      // finalizado, o servidor recusa com 422 SHIPMENT_FINISHED (o app também).
      await withWrite(async (exec) => {
        if (farmChanged) {
          const links = await linksOfAnimal(exec, animalId)
          if (links.some((link) => shipmentStatusOf(link.status) === 'finished')) {
            throw localError(422, SHIPMENT_FLOW_CONTRACT.errors.finished, 'farmId')
          }
          for (const link of links) await deleteLink(exec, link.id)
        }
        await run(
          updateSql('animals', animalId, toColumns('animals', {
            code,
            farmId: input.farmId,
            animalTypeId: input.animalTypeId,
            sex: input.sex,
            breed: input.breed,
            birthDate: input.birthDate,
            herdId,
            updatedAt: ctx.now(),
          })),
          exec,
        )
      })
    },
    async deleteAnimal(animalId: string) {
      if ((await count(db, countQuery('vaccinations', 'animalId', animalId))) > 0) throw localError(409, 'ANIMAL_HAS_VACCINATIONS')
      // CASCADE no servidor (não bloqueado para embarcado; sai até de embarque finalizado): o vínculo sai na mesma
      // transação, para não deixar shipment_animals órfão no SQLite.
      await withWrite(async (exec) => {
        await unlinkAnimalFromShipments(exec, animalId)
        await run({ sql: `DELETE FROM ${t('animals')} WHERE id = ?`, params: [animalId] }, exec)
      })
    },


    // ----- Rebanhos (HERDS_CONTRACT, §17.10) -----
    async createHerd(input: HerdInput, animalIds: string[] = []) {
      assertCanWrite('herds')
      const name = input.name.trim()
      const description = normalizeHerdDescription(input.description)
      const formedAt = input.formedAt
      assertHerdFields(name, description, formedAt)
      return withWrite(async (exec) => {
        const farm = await exec.getOptional<FarmRow>(...spread(farmByIdQuery(input.farmId)))
        if (!farm) throw localError(404, 'FARM_NOT_FOUND', 'farmId')
        if (await exec.getOptional(...spread(herdNameTakenQuery(input.farmId, name)))) {
          throw localError(409, HERDS_CONTRACT.errors.nameTaken, 'name')
        }
        const newId = id()
        await run(
          insertSql('herds', newId, toColumns('herds', {
            farmId: input.farmId,
            name,
            description,
            formedAt,
            createdAt: ctx.now(),
            updatedAt: ctx.now(),
          })),
          exec,
        )
        if (animalIds.length) await linkAnimalsToHerd(exec, newId, input.farmId, animalIds)
        return newId
      })
    },
    async updateHerd(herdId: string, input: HerdInput) {
      assertCanWrite('herds')
      const current = await db.getOptional<HerdRow>(...spread(herdByIdQuery(herdId)))
      if (!current) throw localError(404, HERDS_CONTRACT.errors.notFound)
      if (input.farmId && input.farmId !== current.farmId) {
        throw localError(400, HERDS_CONTRACT.errors.farmImmutable, 'farmId')
      }
      const name = input.name.trim()
      const description = normalizeHerdDescription(input.description)
      const formedAt = input.formedAt
      assertHerdFields(name, description, formedAt)
      if (await db.getOptional(...spread(herdNameTakenQuery(current.farmId, name, herdId)))) {
        throw localError(409, HERDS_CONTRACT.errors.nameTaken, 'name')
      }
      await run(updateSql('herds', herdId, toColumns('herds', {
        name,
        description,
        formedAt,
        updatedAt: ctx.now(),
      })))
    },
    async deleteHerd(herdId: string) {
      assertCanWrite('herds')
      const current = await db.getOptional<HerdRow>(...spread(herdByIdQuery(herdId)))
      if (!current) throw localError(404, HERDS_CONTRACT.errors.notFound)
      const linked = await db.getAll<{ id: string }>(
        `SELECT id FROM ${t('animals')} WHERE ${col('animals', 'herdId')} = ?`,
        [herdId],
      )
      if (HERDS_CONTRACT.unlinkAnimalsOnDelete) {
        for (const row of linked) {
          await run(updateSql('animals', row.id, toColumns('animals', { herdId: null, updatedAt: ctx.now() })))
        }
      }
      await run({ sql: `DELETE FROM ${t('herds')} WHERE id = ?`, params: [herdId] })
    },
    async assignAnimalsToHerd(herdId: string, animalIds: string[]) {
      const herd = await db.getOptional<HerdRow>(...spread(herdByIdQuery(herdId)))
      if (!herd) throw localError(404, HERDS_CONTRACT.errors.notFound, 'herdId')
      await withWrite((exec) => linkAnimalsToHerd(exec, herdId, herd.farmId, animalIds))
    },
    async removeAnimalFromHerd(animalId: string) {
      const animal = await db.getOptional<AnimalRow>(...spread(animalByIdQuery(animalId, ctx.today())))
      if (!animal) throw localError(404, 'ANIMAL_NOT_FOUND')
      await run(updateSql('animals', animalId, toColumns('animals', { herdId: null, updatedAt: ctx.now() })))
    },

    // ----- Embarques (SHIPMENTS_CONTRACT + SHIPMENT_FLOW_CONTRACT, contrato final) -----
    /** Novo embarque: sempre Em andamento, sem animais (eles entram um a um, com foto e peso). */
    async createShipment(input: ShipmentInput) {
      assertCanShipment('write')
      const name = input.name.trim()
      const shippedOn = input.shippedOn
      assertShipmentFields(name, shippedOn)
      return withWrite(async (exec) => {
        const farm = await exec.getOptional<FarmRow>(...spread(farmByIdQuery(input.farmId)))
        if (!farm) throw localError(404, 'FARM_NOT_FOUND', 'farmId')
        if (await exec.getOptional(...spread(shipmentNameTakenQuery(input.farmId, name)))) {
          throw localError(409, SHIPMENTS_CONTRACT.errors.nameTaken, 'name')
        }
        const newId = id()
        await run(
          insertSql('shipments', newId, toColumns('shipments', {
            farmId: input.farmId,
            name,
            shippedOn,
            status: SHIPMENT_FLOW_CONTRACT.defaultStatus,
            // Servidor recalcula (ignorado no upload); gravado para a consulta local.
            createdByUserId: ctx.currentUser()?.id ?? null,
            createdAt: ctx.now(),
            updatedAt: ctx.now(),
          })),
          exec,
        )
        return newId
      })
    },
    /**
     * Nome e data numa writeTransaction. Só Em andamento (422 SHIPMENT_FINISHED). A fazenda não muda.
     * Mudar a data NÃO revalida carência (contrato final: só aviso, feito na tela).
     */
    async updateShipment(shipmentId: string, input: ShipmentUpdate) {
      assertCanShipment('write')
      const name = input.name.trim()
      const shippedOn = input.shippedOn
      assertShipmentFields(name, shippedOn)
      await withWrite(async (exec) => {
        const current = await openShipment(exec, shipmentId)
        if (input.farmId && input.farmId !== current.farmId) {
          throw localError(400, SHIPMENTS_CONTRACT.errors.farmImmutable, 'farmId')
        }
        if (await exec.getOptional(...spread(shipmentNameTakenQuery(current.farmId, name, shipmentId)))) {
          throw localError(409, SHIPMENTS_CONTRACT.errors.nameTaken, 'name')
        }
        await run(updateSql('shipments', shipmentId, toColumns('shipments', { name, shippedOn, updatedAt: ctx.now() })), exec)
      })
    },
    /**
     * Adiciona UM animal (basic, master, admin) com peso e foto obrigatórios, na mesma writeTransaction: vínculo
     * (weight_kg + photo_id gerado aqui) + foto na fila local. No upload, a foto sobe ANTES do PUT do vínculo
     * (POST /shipments/:id/photos com o mesmo id). Carência não bloqueia. Devolve o id do vínculo (shipmentAnimalId).
     */
    async addShipmentAnimal(shipmentId: string, input: ShipmentAnimalInput) {
      assertCanShipment('write')
      return withWrite(async (exec) => {
        const current = await openShipment(exec, shipmentId)
        const shippedOn = String(current.shippedOn ?? '').slice(0, 10)
        await assertShipmentAnimal(exec, current.farmId, shippedOn, input.animalId)
        const weightKg = normalizeWeight(input.weightKg)
        const photoUri = requirePhoto(input.photoUri)
        const linkId = id()
        const photoId = await queuePhoto(exec, linkId, shipmentId, input.animalId, photoUri)
        await run(
          insertSql('shipmentAnimals', linkId, toColumns('shipmentAnimals', {
            shipmentId,
            animalId: input.animalId,
            weightKg,
            photoId,
            createdAt: ctx.now(),
            updatedAt: ctx.now(),
          })),
          exec,
        )
        return linkId
      })
    },
    /** Ajusta peso e/ou foto de um animal do embarque (mesma linha de vínculo; foto nova = photo_id novo). Só Em andamento. */
    async updateShipmentAnimal(linkId: string, input: ShipmentAnimalUpdate) {
      assertCanShipment('write')
      await withWrite(async (exec) => {
        const link = await exec.getOptional<{ shipmentId: string; animalId: string }>(
          `SELECT ${saShipment} AS shipmentId, ${saAnimal} AS animalId FROM ${SA} WHERE id = ?`,
          [linkId],
        )
        if (!link) throw localError(404, SHIPMENTS_CONTRACT.errors.linkNotFound)
        await openShipment(exec, link.shipmentId)
        const weightKg = input.weightKg === undefined ? undefined : normalizeWeight(input.weightKg)
        const photoUri = input.photoUri === undefined ? undefined : requirePhoto(input.photoUri)
        const photoId = photoUri === undefined ? undefined : await queuePhoto(exec, linkId, link.shipmentId, link.animalId, photoUri)
        const changes: Record<string, unknown> = { updatedAt: ctx.now() }
        if (weightKg !== undefined) changes.weightKg = weightKg
        if (photoId !== undefined) changes.photoId = photoId
        if (Object.keys(changes).length > 1) await run(updateSql('shipmentAnimals', linkId, toColumns('shipmentAnimals', changes)), exec)
      })
    },
    /** Remove um animal do embarque (DELETE da linha de vínculo; basic pode). Só Em andamento. */
    async removeShipmentAnimal(linkId: string) {
      assertCanShipment('write')
      await withWrite(async (exec) => {
        const link = await exec.getOptional<{ shipmentId: string }>(`SELECT ${saShipment} AS shipmentId FROM ${SA} WHERE id = ?`, [linkId])
        if (!link) throw localError(404, SHIPMENTS_CONTRACT.errors.linkNotFound)
        await openShipment(exec, link.shipmentId)
        await deleteLink(exec, linkId)
      })
    },
    /**
     * Finaliza (basic, master, admin): PATCH shipments { status: "finished" } no sync (depois das fotos e vínculos, pela
     * ordem da fila). Vazio → 422 SHIPMENT_EMPTY; vínculos antigos sem peso/foto não impedem. finished_at e o
     * shipped_at dos animais são gravados localmente (somem da lista na hora, offline) e NÃO sobem: o servidor os
     * calcula e devolve no sync.
     */
    async finishShipment(shipmentId: string) {
      assertCanShipment('write')
      await withWrite(async (exec) => {
        await openShipment(exec, shipmentId)
        const linked = await exec.getAll<{ animalId: string }>(`SELECT ${saAnimal} AS animalId FROM ${SA} WHERE ${saShipment} = ?`, [shipmentId])
        if (!linked.length) throw localError(422, SHIPMENT_FLOW_CONTRACT.errors.empty)
        const now = ctx.now()
        await run(updateSql('shipments', shipmentId, toColumns('shipments', { status: 'finished', finishedAt: now, updatedAt: now })), exec)
        for (const link of linked) {
          await run(updateSql('animals', link.animalId, toColumns('animals', { shippedAt: now })), exec)
        }
      })
    },
    /**
     * Só master/admin. Em andamento: desvincula (os animais voltam à lista). Finalizado: os animais continuam
     * embarcados (shipped_at fica no animal). Vínculos, fotos da fila e o embarque saem na mesma transação.
     */
    async deleteShipment(shipmentId: string) {
      assertCanShipment('delete')
      await withWrite(async (exec) => {
        const current = await exec.getOptional<ShipmentRow>(...spread(shipmentByIdQuery(shipmentId)))
        if (!current) throw localError(404, SHIPMENTS_CONTRACT.errors.notFound)
        const links = await exec.getAll<{ id: string }>(`SELECT id FROM ${SA} WHERE ${saShipment} = ?`, [shipmentId])
        for (const link of links) await deleteLink(exec, link.id)
        await run({ sql: `DELETE FROM ${PQ} WHERE ${pq.shipmentId.name} = ?`, params: [shipmentId] }, exec)
        await run({ sql: `DELETE FROM ${t('shipments')} WHERE id = ?`, params: [shipmentId] }, exec)
      })
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

function assertHerdFields(name: string, description: string | null, formedAt: string) {
  const { min, max } = HERDS_CONTRACT.limits.name
  if (name.length < min || name.length > max) throw localError(400, HERDS_CONTRACT.errors.invalidName, 'name')
  if (description && description.length > HERDS_CONTRACT.limits.description.max) {
    throw localError(400, HERDS_CONTRACT.errors.invalidDescription, 'description')
  }
  if (!isValidHerdFormedAt(formedAt, todayIsoInHerdZone())) {
    throw localError(400, HERDS_CONTRACT.errors.invalidFormedAt, 'formedAt')
  }
}

function assertShipmentFields(name: string, shippedOn: string) {
  if (!isValidShipmentName(name)) throw localError(400, SHIPMENTS_CONTRACT.errors.invalidName, 'name')
  if (!isValidShippedOn(shippedOn, todayIsoInShipmentZone())) {
    throw localError(400, SHIPMENTS_CONTRACT.errors.invalidShippedOn, 'shippedOn')
  }
}

export type LocalRepository = ReturnType<typeof createRepository>

