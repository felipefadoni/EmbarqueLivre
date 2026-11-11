/**
 * Contrato FINAL de Embarques (API_INTEGRATION.md §17.11 e §19, no ar no dev em 10/11/2026).
 *
 * Única fonte dos nomes de tabela, colunas, rotas, filtros, códigos de erro e flags de embarque.
 * O mapping/schema do PowerSync (`src/sync/mapping.ts`) e as telas só leem estas chaves.
 *
 * - Tabelas `shipments` e `shipment_animals` (linha de vínculo com id próprio) nos streams `account` e `admin_all`.
 * - Um embarque pertence a UMA fazenda (imutável: `SHIPMENT_FARM_IMMUTABLE`).
 * - Nome único por fazenda, sem diferenciar maiúsculas (2–120 após trim).
 * - `shipped_on` (YYYY-MM-DD, REST `shippedOn`) entre 1900-01-01 e hoje + 2 anos (America/Sao_Paulo).
 * - Um animal em no máximo UMA linha de `shipment_animals` (409 `ANIMAL_ALREADY_IN_SHIPMENT`, mesmo no mesmo embarque):
 *   para manter um animal, reaproveite a linha existente; para movê-lo, PATCH da mesma linha ou DELETE + PUT.
 * - Carência no dia do embarque (só aplicações com applied_at <= shipped_on; livre se shippedOn >= freeAt; sem vacinação
 *   = livre) é só AVISO: não bloqueia vínculo nem mudança de data (SHIPMENT_ANIMAL_IN_WITHDRAWAL deixou de existir).
 * - Validação ao incluir um animal, nesta ordem: SHIPMENT_FINISHED → ANIMAL_NOT_FOUND → SHIPMENT_ANIMAL_FARM_MISMATCH
 *   → ANIMAL_ALREADY_SHIPPED → ANIMAL_ALREADY_IN_SHIPMENT → INVALID_SHIPMENT_ANIMAL_WEIGHT → SHIPMENT_ANIMAL_PHOTO_REQUIRED.
 * - `animalIds` SAIU de POST/PUT/PATCH: animais entram e saem por /shipments/:id/animals (ou linhas shipment_animals no sync).
 * - Permissões: admin/master/basic leem, criam, editam, incluem/removem animais (DELETE de linhas de vínculo), enviam
 *   foto, mudam peso e finalizam; DELETE do embarque só master/admin (basic → 403 INSUFFICIENT_ROLE, também como op
 *   `rejected` no upload: definitiva, sem retry).
 * - Excluir o embarque remove os vínculos; excluir o animal (CASCADE) também; trocá-lo de fazenda desvincula de embarque
 *   em andamento (finalizado → 422 SHIPMENT_FINISHED).
 * - Telas são offline-first (PowerSync). `path` documenta o REST (cliente em `src/api/catalog.ts`).
 */
import { todayIsoInHerdZone } from './herdsContract'

export const SHIPMENTS_CONTRACT = {
  provisional: false,
  table: 'shipments',
  columns: {
    farmId: 'farm_id',
    name: 'name',
    shippedOn: 'shipped_on',
    /** Preenchido e recalculado pelo servidor (ignorado no upload). */
    createdByUserId: 'created_by_user_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  /** Tabela de vínculo embarque ↔ animal (uma linha por animal, id próprio gerado no app). */
  linkTable: 'shipment_animals',
  linkColumns: {
    shipmentId: 'shipment_id',
    animalId: 'animal_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  shippedOnField: 'shippedOn' as const,
  streams: ['account', 'admin_all'] as const,
  stream: 'account' as const,
  path: '/shipments',
  /** GET `${path}/:id/eligible-animals?shippedOn=` → { shipmentId, shippedOn, free, inWithdrawal } (apoio online). */
  eligiblePath: 'eligible-animals',
  routes: {
    // Área própria na tab bar (antes ficava em /configuracoes/embarques).
    list: '/embarques',
    create: '/embarques/nova',
    edit: '/embarques/[id]',
  },
  /** Filtros REST da listagem (o app filtra localmente pelo PowerSync). */
  filters: {
    farmId: 'farmId',
    search: 'search',
    shippedFrom: 'shippedFrom',
    shippedTo: 'shippedTo',
  },
  /** PUT exige farmId (= o atual); PATCH não aceita farmId (400 do ValidationPipe). */
  putRequiresFarmId: true,
  patchAcceptsFarmId: false,
  searchDebounceMs: 400,
  nameUniquePerFarm: true,
  nameUniqueCaseInsensitive: true,
  shippedOnRequired: true,
  shippedOnMin: '1900-01-01',
  /** Máximo: hoje + 2 anos. */
  shippedOnMaxYearsAhead: 2,
  todayTimeZone: 'America/Sao_Paulo',
  farmImmutable: true,
  oneShipmentPerAnimal: true,
  /** `animalIds` saiu de POST/PUT/PATCH (400 se vier): vínculos só por /shipments/:id/animals ou shipment_animals. */
  animalIdsInShipmentBody: false,
  unlinkAnimalsOnDelete: true,
  /** Excluir o animal ou trocá-lo de fazenda (embarque em andamento) remove o vínculo (local: mesma transação). */
  unlinkOnAnimalDeleteOrFarmChange: true,
  /** Carência no embarque: só aplicações com applied_at <= shipped_on. Só aviso (não bloqueia). */
  withdrawalUsesApplicationsUntilShippedOn: true,
  withdrawalBlocks: false,
  errors: {
    notFound: 'SHIPMENT_NOT_FOUND',
    linkNotFound: 'SHIPMENT_ANIMAL_NOT_FOUND',
    animalNotFound: 'ANIMAL_NOT_FOUND',
    nameTaken: 'SHIPMENT_NAME_ALREADY_EXISTS',
    invalidName: 'INVALID_SHIPMENT_NAME',
    invalidShippedOn: 'INVALID_SHIPPED_ON',
    farmImmutable: 'SHIPMENT_FARM_IMMUTABLE',
    animalFarmMismatch: 'SHIPMENT_ANIMAL_FARM_MISMATCH',
    animalAlreadyInShipment: 'ANIMAL_ALREADY_IN_SHIPMENT',
    farmHasShipments: 'FARM_HAS_SHIPMENTS',
  },
  limits: {
    name: { min: 2, max: 120 },
  },
} as const

export type ShipmentsContract = typeof SHIPMENTS_CONTRACT

/** YYYY-MM-DD de hoje em America/Sao_Paulo (mesmo cálculo do rebanho). */
export function todayIsoInShipmentZone(now = new Date()): string {
  return todayIsoInHerdZone(now)
}

/** Hoje + N anos (29/02 vira 28/02 quando o ano de destino não é bissexto). */
export function maxShippedOn(today = todayIsoInShipmentZone()): string {
  const year = Number(today.slice(0, 4)) + SHIPMENTS_CONTRACT.shippedOnMaxYearsAhead
  const month = Number(today.slice(5, 7))
  let day = Number(today.slice(8, 10))
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > last) day = last
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Data civil real entre 1900-01-01 e hoje + 2 anos (America/Sao_Paulo, salvo `today` informado). */
export function isValidShippedOn(iso: string | null | undefined, today = todayIsoInShipmentZone()): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day) return false
  return iso >= SHIPMENTS_CONTRACT.shippedOnMin && iso <= maxShippedOn(today)
}

export function isValidShipmentName(name: string | null | undefined): boolean {
  const value = (name ?? '').trim()
  const { min, max } = SHIPMENTS_CONTRACT.limits.name
  return value.length >= min && value.length <= max
}

/**
 * Fatia "status, foto, peso e finalizar" — contrato FINAL (API_INTEGRATION.md §17.11 slice 2 e §19, no ar no dev).
 *
 * - shipments.status in_progress | finished (+ finished_at, do servidor). Todo embarque nasce in_progress, sem animais.
 *   Finalizado é irreversível e só leitura (422 SHIPMENT_FINISHED; replay com os mesmos valores passa sem mudar nada).
 * - Finalizar: REST POST /shipments/:id/finish; no sync, PATCH do embarque { status: "finished" } (o app usa o sync).
 *   Vazio → 422 SHIPMENT_EMPTY. Vínculos antigos sem peso/foto não impedem.
 * - shipment_animals.weight_kg (1–2000, 1 casa) e photo_id (+ photo_content_type/photo_size_bytes, do servidor):
 *   obrigatórios em vínculo NOVO.
 * - Foto: POST /shipments/:id/photos (multipart `photo` + `id` do app; repetir o id devolve a mesma foto) ANTES do PUT do
 *   vínculo com photo_id; GET /shipments/:id/photos/:photoId (autenticado) para exibir. A tabela shipment_photos é só do
 *   servidor (não sincroniza) e o binário nunca vai no /powersync/upload.
 * - animals.shipped_at (do servidor; o app grava localmente ao finalizar): flag OFICIAL de "embarcado". Lista de
 *   cadastrados e pickers escondem shipped_at IS NOT NULL; o detalhe do embarque continua mostrando.
 */
export const SHIPMENT_FLOW_CONTRACT = {
  provisional: false,
  statuses: ['in_progress', 'finished'] as const,
  defaultStatus: 'in_progress' as const,
  columns: { status: 'status', finishedAt: 'finished_at' },
  linkColumns: {
    weightKg: 'weight_kg',
    photoId: 'photo_id',
    photoContentType: 'photo_content_type',
    photoSizeBytes: 'photo_size_bytes',
  },
  animalShippedAtColumn: 'shipped_at',
  /** Tabela local (não sincronizada) com a fila de upload das fotos (id = photo_id gerado no app). */
  photoQueueTable: 'shipment_photo_queue',
  statusFilterParam: 'status',
  /** Sync: PATCH shipments { status: "finished" }. REST: POST /shipments/:id/finish. */
  finishVia: 'patch-status' as const,
  finishPath: (shipmentId: string) => `/shipments/${shipmentId}/finish`,
  /** Ordem obrigatória no upload: foto → vínculo (photo_id, weight_kg) → finalizar. */
  uploadOrder: ['photo', 'link', 'finish'] as const,
  routes: {
    list: '/embarques',
    create: '/embarques/nova',
    edit: '/embarques/[id]',
  },
  photo: {
    maxSidePx: 1280,
    jpegQuality: 0.7,
    mimeType: 'image/jpeg',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
    maxBytes: 10 * 1024 * 1024,
    fieldName: 'photo',
    idField: 'id',
    /** POST multipart (relativo a /api/v1). */
    uploadPath: (shipmentId: string) => `/shipments/${shipmentId}/photos`,
    /** GET autenticado (relativo a /api/v1). */
    downloadPath: (shipmentId: string, photoId: string) => `/shipments/${shipmentId}/photos/${photoId}`,
    animalsPath: (shipmentId: string) => `/shipments/${shipmentId}/animals`,
    animalPath: (shipmentId: string, shipmentAnimalId: string) => `/shipments/${shipmentId}/animals/${shipmentAnimalId}`,
  },
  weightKg: { min: 1, max: 2000, decimals: 1 },
  errors: {
    finished: 'SHIPMENT_FINISHED',
    empty: 'SHIPMENT_EMPTY',
    invalidWeight: 'INVALID_SHIPMENT_ANIMAL_WEIGHT',
    photoRequired: 'SHIPMENT_ANIMAL_PHOTO_REQUIRED',
    animalAlreadyShipped: 'ANIMAL_ALREADY_SHIPPED',
    invalidPhoto: 'INVALID_SHIPMENT_PHOTO',
    photoNotFound: 'SHIPMENT_PHOTO_NOT_FOUND',
    photoInUse: 'SHIPMENT_PHOTO_IN_USE',
    invalidStatus: 'INVALID_SHIPMENT_STATUS',
  },
} as const

export type ShipmentStatus = (typeof SHIPMENT_FLOW_CONTRACT.statuses)[number]

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  in_progress: 'Em andamento',
  finished: 'Finalizado',
}

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return typeof value === 'string' && (SHIPMENT_FLOW_CONTRACT.statuses as readonly string[]).includes(value)
}

/** Linha sem status (dado antigo / servidor sem a coluna) = em andamento. */
export function shipmentStatusOf(raw: unknown): ShipmentStatus {
  return isShipmentStatus(raw) ? raw : SHIPMENT_FLOW_CONTRACT.defaultStatus
}

/**
 * Peso digitado (aceita vírgula ou ponto, "452,5" / "452.5") → número com no máximo 1 casa, ou null se inválido.
 * Regra: 1–2000 kg, no máximo 1 casa decimal.
 */
export function parseWeightKg(input: string | number | null | undefined): number | null {
  if (input == null) return null
  const text = String(input).trim().replace(/\s+/g, '').replace(',', '.')
  if (!/^\d{1,4}(\.\d)?$/.test(text)) return null
  const value = Number(text)
  return isValidWeightKg(value) ? value : null
}

export function isValidWeightKg(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  const { min, max } = SHIPMENT_FLOW_CONTRACT.weightKg
  if (value < min || value > max) return false
  return Math.abs(Math.round(value * 10) - value * 10) < 1e-9
}

/** 452.5 → "452,5 kg"; 450 → "450 kg". */
export function formatWeightKg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Sem peso'
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
  return `${text} kg`
}

export const WEIGHT_HINT = 'Informe o peso em kg, entre 1 e 2000, com no máximo 1 casa decimal (ex.: 452,5).'

/**
 * Tamanho final da foto: o maior lado vai a no máximo `maxSide` (1280 px), mantendo a proporção.
 * null = já está dentro do limite (só recomprime em JPEG).
 */
export function fitWithin(width: number, height: number, maxSide: number = SHIPMENT_FLOW_CONTRACT.photo.maxSidePx): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null
  const longest = Math.max(width, height)
  if (longest <= maxSide) return null
  const scale = maxSide / longest
  return width >= height
    ? { width: maxSide, height: Math.max(1, Math.round(height * scale)) }
    : { width: Math.max(1, Math.round(width * scale)), height: maxSide }
}
