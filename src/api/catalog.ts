import {
  asNullableString,
  asNumber,
  asRecord,
  asString,
  createResourceClient,
  parseAnimalWithdrawal,
  parseWithdrawalSummary,
  VACCINATION_CONTRACT,
  type AnimalWithdrawal,
  type WithdrawalSummary,
} from './contract'

export type Farm = {
  id: string
  accountId: string
  accountName?: string | null
  /** @deprecated = accountId */
  ownerUserId: string
  /** @deprecated = accountName */
  ownerName?: string
  /** @deprecated sempre null */
  ownerEmail?: string | null
  name: string
  city: string
  state: string
}

export type FarmPayload = {
  name: string
  city: string
  state: string
  accountId?: string
  /** @deprecated use accountId */
  ownerUserId?: string
}

export type Vaccine = {
  id: string
  name: string
  withdrawalDays: number
}

export type VaccinePayload = {
  name: string
  withdrawalDays: number
}

export type AnimalType = {
  id: string
  name: string
}

export type AnimalTypePayload = {
  name: string
}

export type AnimalSex = 'M' | 'F'

export type Animal = {
  id: string
  code: string
  farmId: string
  animalTypeId: string
  sex: AnimalSex | null
  breed: string | null
  birthDate: string | null
  farmName?: string
  animalTypeName?: string
  herdId?: string | null
  herdName?: string
  /** Bloco de carência (GET /animals/:id). null quando a API não envia. */
  withdrawal: AnimalWithdrawal | null
  /** `totalWithdrawalDays`, `freeAt`, `inWithdrawal` do topo do animal (lista e detalhe). */
  withdrawalSummary: WithdrawalSummary | null
}

export type AnimalPayload = {
  code: string
  farmId: string
  animalTypeId: string
  sex: AnimalSex | null
  breed: string | null
  birthDate: string | null
  herdId?: string | null
}

function nestedName(raw: unknown): string | undefined {
  const record = asRecord(raw)
  const name = asString(record.name)
  return name || undefined
}

export function parseFarm(raw: unknown): Farm {
  const record = asRecord(raw)
  const owner = asRecord(record.owner)
  const accountId = asString(record.accountId) || asString(record.ownerUserId)
  const accountName = asNullableString(record.accountName ?? record.ownerName ?? owner.name)
  return {
    id: asString(record.id),
    accountId,
    accountName,
    ownerUserId: asString(record.ownerUserId) || accountId,
    ownerName: accountName ?? undefined,
    ownerEmail: asNullableString(record.ownerEmail ?? owner.email),
    name: asString(record.name),
    city: asString(record.city),
    state: asString(record.state),
  }
}

export function parseVaccine(raw: unknown): Vaccine {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    name: asString(record.name),
    withdrawalDays: asNumber(record.withdrawalDays),
  }
}

export function parseAnimalType(raw: unknown): AnimalType {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    name: asString(record.name),
  }
}

export function parseAnimal(raw: unknown): Animal {
  const record = asRecord(raw)
  const farm = record.farm
  const animalType = record.animalType
  const sexRaw = asString(record.sex).toUpperCase()
  const sex: AnimalSex | null = sexRaw === 'M' || sexRaw === 'F' ? sexRaw : null
  return {
    id: asString(record.id),
    code: asString(record.code),
    farmId: asString(record.farmId),
    animalTypeId: asString(record.animalTypeId),
    sex,
    breed: asNullableString(record.breed),
    birthDate: asNullableString(record.birthDate),
    farmName: nestedName(farm) ?? asNullableString(record.farmName) ?? undefined,
    animalTypeName: nestedName(animalType) ?? asNullableString(record.animalTypeName) ?? undefined,
    herdId: asNullableString(record.herdId) || null,
    herdName: nestedName(record.herd) ?? asNullableString(record.herdName) ?? undefined,
    withdrawal: parseAnimalWithdrawal(record[VACCINATION_CONTRACT.withdrawalField]),
    withdrawalSummary: parseWithdrawalSummary(record),
  }
}

export const farmsApi = createResourceClient('/farms', parseFarm)
export const vaccinesApi = createResourceClient('/vaccines', parseVaccine)
export const animalTypesApi = createResourceClient('/animal-types', parseAnimalType)
export const animalsApi = createResourceClient('/animals', parseAnimal)

/** Tipos locais de rebanho (a API REST ainda não existe; as telas usam só o PowerSync). */
export type Herd = {
  id: string
  farmId: string
  farmName?: string
  name: string
  description: string | null
  /** YYYY-MM-DD (REST `formedAt`, coluna `formed_at`) */
  formedAt: string
  animalCount?: number
  createdAt?: string | null
  updatedAt?: string | null
}

export type HerdPayload = {
  farmId: string
  name: string
  description: string | null
  formedAt: string
}

export function parseHerd(raw: unknown): Herd {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    farmId: asString(record.farmId),
    farmName: asNullableString(record.farmName) ?? undefined,
    name: asString(record.name),
    description: asNullableString(record.description),
    formedAt: asNullableString(record.formedAt) ?? asString(record.formed_at).slice(0, 10),
    animalCount: asNumber(record.animalCount ?? record.animal_count),
    createdAt: asNullableString(record.createdAt ?? record.created_at),
    updatedAt: asNullableString(record.updatedAt ?? record.updated_at),
  }
}

/** Cliente REST (rascunho do contrato). As telas usam só o PowerSync. */
export const herdsApi = createResourceClient('/herds', parseHerd)
