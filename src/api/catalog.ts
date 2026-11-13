import {
  asNullableString,
  asNumber,
  asRecord,
  asString,
  createResourceClient,
  parseAnimalWithdrawal,
  parseWithdrawalSummary,
  SHIPMENTS_CONTRACT,
  VACCINATION_CONTRACT,
  type AnimalWithdrawal,
  type WithdrawalSummary,
} from './contract'
import { http } from './client'
import { SHIPMENT_FLOW_CONTRACT, shipmentStatusOf, type ShipmentStatus } from './shipmentsContract'

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
  /** Só admin, do sync (admin_all). null = autor não registrado; ausente = não consultado (master/básico). */
  createdByEmail?: string | null
  /** Nome de quem cadastrou: ainda não exposto pela API (ver src/api/authorContract.ts). */
  createdByName?: string | null
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
  /** Só admin, do sync (admin_all). null = autor não registrado; ausente = não consultado (master/básico). */
  createdByEmail?: string | null
  /** Nome de quem cadastrou: ainda não exposto pela API (ver src/api/authorContract.ts). */
  createdByName?: string | null
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
  /** Só admin, quando a API expuser em herds (ainda não: ver src/api/authorContract.ts). */
  createdByName?: string | null
  createdByEmail?: string | null
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

/** Embarque (contrato final: SHIPMENTS_CONTRACT, §17.11). As telas usam o PowerSync; o REST é apoio online. */
export type Shipment = {
  id: string
  farmId: string
  farmName?: string
  name: string
  /** YYYY-MM-DD (REST `shippedOn`, coluna `shipped_on`) */
  shippedOn: string
  animalCount?: number
  /** Quem criou (calculado pelo servidor). */
  createdByUserId?: string | null
  /** in_progress | finished (SHIPMENT_FLOW_CONTRACT). */
  status?: ShipmentStatus
  finishedAt?: string | null
  /** Soma dos pesos (vínculos antigos sem peso contam 0). */
  totalWeightKg?: number
  /** Ids da lista (derivado de `animals` no detalhe). */
  animalIds?: string[]
  createdAt?: string | null
  updatedAt?: string | null
}

/** Animal no detalhe (GET /shipments/:id). */
export type ShipmentAnimal = {
  id: string
  /** Id da linha de vínculo em `shipment_animals` (reaproveitar; nunca criar outra para o mesmo animal). */
  shipmentAnimalId: string
  code: string
  sex: AnimalSex | null
  breed: string | null
  birthDate: string | null
  animalTypeId: string
  animalTypeName: string
  herdId: string | null
  herdName: string | null
  freeAt: string | null
  /** false quando o animal está em carência no shippedOn atual. */
  eligible: boolean
  /** = freeAt quando não elegível; senão null. Só aviso (carência não bloqueia). */
  inWithdrawalUntil: string | null
  /** null só em vínculo antigo. */
  weightKg: number | null
  photo: ShipmentPhotoRef | null
  /** Saiu num embarque finalizado. */
  shippedAt: string | null
}

/** Referência da foto (GET autenticado em `url`, relativo à origem da API). */
export type ShipmentPhotoRef = { id: string; contentType: string; sizeBytes: number; url: string }
/** POST /shipments/:id/photos → 201. */
export type ShipmentPhoto = ShipmentPhotoRef & { shipmentId: string }

/** POST /shipments/:id/animals (JSON com photoId; o app usa o sync + POST /photos). */
export type ShipmentAnimalInput = { animalId: string; weightKg: number; photoId?: string; id?: string }
/** PATCH /shipments/:id/animals/:shipmentAnimalId */
export type ShipmentAnimalPatch = { weightKg?: number; photoId?: string }

export type ShipmentDetail = Shipment & { animals: ShipmentAnimal[] }

/** POST e PUT: farmId obrigatório (no PUT, igual ao atual). Sem `animalIds` (saiu do contrato: 400 se vier). */
export type ShipmentPayload = {
  farmId: string
  name: string
  shippedOn: string
}

/** PATCH: sem farmId nem animalIds (o servidor responde 400 se vier). */
export type ShipmentPatch = {
  name?: string
  shippedOn?: string
}

export type ShipmentListParams = {
  farmId?: string
  /** in_progress | finished (outro valor → 400 INVALID_SHIPMENT_STATUS). */
  status?: ShipmentStatus
  search?: string
  shippedFrom?: string
  shippedTo?: string
  page?: number
  limit?: number
}

export type EligibleAnimal = {
  id: string
  code: string
  sex: AnimalSex | null
  breed: string | null
  birthDate: string | null
  animalTypeId: string
  animalTypeName: string
  herdId: string | null
  herdName: string | null
  freeAt: string | null
  /** Já está neste embarque (animais de OUTRO embarque não vêm). */
  inShipment: boolean
}

export type ShipmentEligibility = {
  shipmentId: string
  shippedOn: string
  free: EligibleAnimal[]
  inWithdrawal: EligibleAnimal[]
}

function asNullableDate(raw: unknown): string | null {
  const value = asNullableString(raw)
  return value ? value.slice(0, 10) : null
}

function asSex(raw: unknown): AnimalSex | null {
  return raw === 'M' || raw === 'F' ? raw : null
}

function parseShipmentAnimal(raw: unknown): ShipmentAnimal {
  const record = asRecord(raw)
  const freeAt = asNullableDate(record.freeAt)
  return {
    id: asString(record.id),
    shipmentAnimalId: asString(record.shipmentAnimalId),
    code: asString(record.code),
    sex: asSex(record.sex),
    breed: asNullableString(record.breed),
    birthDate: asNullableDate(record.birthDate),
    animalTypeId: asString(record.animalTypeId),
    animalTypeName: asString(record.animalTypeName),
    herdId: asNullableString(record.herdId),
    herdName: asNullableString(record.herdName),
    freeAt,
    eligible: record.eligible !== false,
    inWithdrawalUntil: asNullableDate(record.inWithdrawalUntil),
    weightKg: record.weightKg != null ? asNumber(record.weightKg) : null,
    photo: parsePhotoRef(record.photo),
    shippedAt: asNullableString(record.shippedAt),
  }
}

function parsePhotoRef(raw: unknown): ShipmentPhotoRef | null {
  if (!raw || typeof raw !== 'object') return null
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    contentType: asString(record.contentType),
    sizeBytes: asNumber(record.sizeBytes),
    url: asString(record.url),
  }
}

function parseEligibleAnimal(raw: unknown): EligibleAnimal {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    code: asString(record.code),
    sex: asSex(record.sex),
    breed: asNullableString(record.breed),
    birthDate: asNullableDate(record.birthDate),
    animalTypeId: asString(record.animalTypeId),
    animalTypeName: asString(record.animalTypeName),
    herdId: asNullableString(record.herdId),
    herdName: asNullableString(record.herdName),
    freeAt: asNullableDate(record.freeAt),
    inShipment: record.inShipment === true,
  }
}

export function parseShipment(raw: unknown): Shipment {
  const record = asRecord(raw)
  const animals = Array.isArray(record.animals) ? record.animals.map(parseShipmentAnimal) : undefined
  return {
    id: asString(record.id),
    farmId: asString(record.farmId ?? record.farm_id),
    farmName: asNullableString(record.farmName) ?? nestedName(record.farm) ?? undefined,
    name: asString(record.name),
    shippedOn: (asNullableString(record.shippedOn) ?? asString(record.shipped_on)).slice(0, 10),
    animalCount: record.animalCount != null ? asNumber(record.animalCount) : animals?.length,
    createdByUserId: asNullableString(record.createdByUserId ?? record.created_by_user_id),
    status: shipmentStatusOf(record.status),
    finishedAt: asNullableString(record.finishedAt ?? record.finished_at),
    totalWeightKg: record.totalWeightKg != null ? asNumber(record.totalWeightKg) : undefined,
    animalIds: animals?.map((animal) => animal.id),
    createdAt: asNullableString(record.createdAt ?? record.created_at),
    updatedAt: asNullableString(record.updatedAt ?? record.updated_at),
  }
}

export function parseShipmentDetail(raw: unknown): ShipmentDetail {
  const record = asRecord(raw)
  return { ...parseShipment(raw), animals: Array.isArray(record.animals) ? record.animals.map(parseShipmentAnimal) : [] }
}

const shipmentsResource = createResourceClient(SHIPMENTS_CONTRACT.path, parseShipment)
const shipmentPath = (id: string) => `${SHIPMENTS_CONTRACT.path}/${id}`

/** Cliente REST de embarques (as telas gravam pelo PowerSync; foto: src/api/shipmentPhotos.ts). */
export const shipmentsApi = {
  /** GET /shipments?farmId&search&shippedFrom&shippedTo&status&page&limit (paginado; shippedOn desc). */
  list(params: ShipmentListParams = {}) {
    return shipmentsResource.list(params)
  },
  get(id: string): Promise<ShipmentDetail> {
    return http.get(shipmentPath(id)).then((res) => parseShipmentDetail(res.data))
  },
  /** Sempre nasce in_progress e sem animais. */
  create(body: ShipmentPayload): Promise<ShipmentDetail> {
    const { farmId, name, shippedOn } = body
    return http.post(SHIPMENTS_CONTRACT.path, { farmId, name, shippedOn }).then((res) => parseShipmentDetail(res.data))
  },
  /** PUT: farmId obrigatório e igual ao atual (senão SHIPMENT_FARM_IMMUTABLE). Só in_progress. */
  replace(id: string, body: ShipmentPayload): Promise<ShipmentDetail> {
    const { farmId, name, shippedOn } = body
    return http.put(shipmentPath(id), { farmId, name, shippedOn }).then((res) => parseShipmentDetail(res.data))
  },
  /** PATCH: nunca envia farmId nem animalIds. Só in_progress. */
  update(id: string, body: ShipmentPatch): Promise<ShipmentDetail> {
    const { name, shippedOn } = body
    const patch: ShipmentPatch = {}
    if (name !== undefined) patch.name = name
    if (shippedOn !== undefined) patch.shippedOn = shippedOn
    return http.patch(shipmentPath(id), patch).then((res) => parseShipmentDetail(res.data))
  },
  /** POST /shipments/:id/finish → 200 com o detalhe (SHIPMENT_EMPTY / SHIPMENT_FINISHED 422). */
  finish(id: string): Promise<ShipmentDetail> {
    return http.post(SHIPMENT_FLOW_CONTRACT.finishPath(id)).then((res) => parseShipmentDetail(res.data))
  },
  /** POST /shipments/:id/animals (JSON com photoId de uma foto já enviada) → 201 detalhe. */
  addAnimal(id: string, body: ShipmentAnimalInput): Promise<ShipmentDetail> {
    return http.post(SHIPMENT_FLOW_CONTRACT.photo.animalsPath(id), body).then((res) => parseShipmentDetail(res.data))
  },
  /** PATCH /shipments/:id/animals/:shipmentAnimalId (peso e/ou photoId). */
  updateAnimal(id: string, shipmentAnimalId: string, body: ShipmentAnimalPatch): Promise<ShipmentDetail> {
    return http.patch(SHIPMENT_FLOW_CONTRACT.photo.animalPath(id, shipmentAnimalId), body).then((res) => parseShipmentDetail(res.data))
  },
  /** DELETE /shipments/:id/animals/:shipmentAnimalId → 204 (apaga a foto). Basic pode. */
  removeAnimal(id: string, shipmentAnimalId: string) {
    return http.delete(SHIPMENT_FLOW_CONTRACT.photo.animalPath(id, shipmentAnimalId))
  },
  /** DELETE → 204 (só master/admin). */
  remove(id: string) {
    return shipmentsResource.remove(id)
  },
}

/** GET /shipments/:id/eligible-animals?shippedOn= (apoio online; a análise da tela é local). */
export function fetchShipmentEligibleAnimals(id: string, shippedOn?: string): Promise<ShipmentEligibility> {
  return http
    .get(`${shipmentPath(id)}/${SHIPMENTS_CONTRACT.eligiblePath}`, { params: shippedOn ? { shippedOn } : undefined })
    .then((res) => {
      const record = asRecord(res.data)
      const list = (raw: unknown) => (Array.isArray(raw) ? raw.map(parseEligibleAnimal) : [])
      return {
        shipmentId: asString(record.shipmentId, id),
        shippedOn: asNullableDate(record.shippedOn) ?? shippedOn ?? '',
        free: list(record.free),
        inWithdrawal: list(record.inWithdrawal),
      }
    })
}
