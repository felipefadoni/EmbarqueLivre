import { asNullableString, asNumber, asRecord, asString, createResourceClient } from './contract'

export type Farm = {
  id: string
  ownerUserId: string
  ownerName?: string
  ownerEmail?: string
  name: string
  city: string
  state: string
}

export type FarmPayload = {
  name: string
  city: string
  state: string
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
}

export type AnimalPayload = {
  code: string
  farmId: string
  animalTypeId: string
  sex: AnimalSex | null
  breed: string | null
  birthDate: string | null
}

function nestedName(raw: unknown): string | undefined {
  const record = asRecord(raw)
  const name = asString(record.name)
  return name || undefined
}

export function parseFarm(raw: unknown): Farm {
  const record = asRecord(raw)
  const owner = asRecord(record.owner)
  return {
    id: asString(record.id),
    ownerUserId: asString(record.ownerUserId),
    ownerName: asNullableString(record.ownerName ?? owner.name) ?? undefined,
    ownerEmail: asNullableString(record.ownerEmail ?? owner.email) ?? undefined,
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
  }
}

export const farmsApi = createResourceClient('/farms', parseFarm)
export const vaccinesApi = createResourceClient('/vaccines', parseVaccine)
export const animalTypesApi = createResourceClient('/animal-types', parseAnimalType)
export const animalsApi = createResourceClient('/animals', parseAnimal)
