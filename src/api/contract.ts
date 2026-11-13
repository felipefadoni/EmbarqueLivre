import { http } from './client'

/**
 * Contrato dos cadastros (Fazendas, Vacinas, Tipos, Animais).
 *
 * - Base `/api/v1` via `http` (Bearer no interceptor)
 * - Coleções: `/farms`, `/vaccines`, `/animal-types`, `/animals`
 * - `id` string (ULID), PATCH `/:id`, DELETE `/:id`
 * - Campos em camelCase: `withdrawalDays`, `farmId`, `animalTypeId`, `birthDate`
 *   (os demais seguem iguais: `name`, `city`, `state`, `code`, `sex`, `breed`)
 * - Filtro de animais: GET `/animals?farmId=&animalTypeId=`
 * - `breed` e `birthDate` opcionais; enviar `null` quando vazios
 * - 409: `{ statusCode, error, message }` com os códigos de domínio acordados
 *
 * Paginação:
 * - Pedido: `?page=1&limit=20` (page começa em 1; limit padrão 20, máximo 100)
 * - Resposta principal: `{ data, meta: { page, limit, total, totalPages } }`
 * - Se `totalPages` vier ausente, é calculado como ceil(total/limit)
 * - O parser também aceita array puro, `{ items }`, `{ results }` e `nextCursor`
 */
export { HERDS_CONTRACT } from './herdsContract'
export { SHIPMENTS_CONTRACT, SHIPMENT_FLOW_CONTRACT } from './shipmentsContract'

export const RESOURCE_CONTRACT = {
  updateMethod: 'patch' as const,
  idField: 'id' as const,
  idType: 'string' as const,
  fieldNaming: 'camelCase' as const,
  deleteMethod: 'delete' as const,
  pagination: {
    mode: 'page' as const,
    pageParam: 'page',
    limitParam: 'limit',
    defaultLimit: 20,
    maxLimit: 100,
    firstPage: 1,
  },
  /**
   * Listagem admin de masters ativos.
   * GET /api/v1/users/masters?search=&page=&limit=
   * Resposta: { data: { id, name, email }[], meta }
   * `search` filtra por nome ou email.
   */
  masters: {
    path: '/users/masters',
    searchParam: 'search',
    /** Na API (12/11/2026) só page/limit (ListMastersRequest estende PaginationQuery). Com keyset na API → true. */
    supportsCursor: false as boolean,
  },
}

/**
 * Usuários da conta (Menu → Usuários). Contrato final: API_INTEGRATION.md §20.
 * Tudo que pode mudar fica AQUI, em flags; telas e cliente (src/api/users.ts, src/api/accounts.ts) só leem estas chaves.
 * Só admin e master (basic → 403 INSUFFICIENT_ROLE). Base: /api/v1 (baseURL do cliente http).
 *
 * - Listar:  GET    /account/users?page&limit<=100&search&role=master|basic[&accountId]
 *            (admin sem accountId = todas as contas; master pedindo outra conta → 403)
 * - Detalhe: GET    /account/users/:id → 200 (mesmo item); fora do escopo / removido / admin → 404 USER_NOT_FOUND
 * - Criar:   POST   /account/users { name, email, mobilePhone, whatsAppPhone, password, role, accountId? } → 201
 *            (accountId obrigatório para admin; telefones obrigatórios, iguais ao payload do signup)
 * - Editar:  PATCH  /account/users/:id { name?, role?, mobilePhone?, whatsAppPhone? } → 200 (parcial; {} aceito;
 *            null ou "" → 400; não envia email, password, accountId nem status)
 * - Excluir: DELETE /account/users/:id → 204 (soft delete + revoga sessões; repetir → 404 = já excluído)
 * - Contas:  GET    /accounts?search&page&limit (só admin) → { id, name, masterCount, createdAt }
 * Item (GET/POST/PATCH): { id, accountId, name, email, mobilePhone, whatsAppPhone, role, status, canAccess,
 *   createdByUserId, createdAt, updatedAt }. Telefones vêm em E.164.
 * Contas migradas usam o id do antigo master como accountId.
 *
 * Auth / PowerSync / fazendas (campos deprecados mantidos por uma versão):
 * - login, refresh, /me e signup: `user.accountId` (masterUserId deprecado). JWT: claim `aid` (`mid` deprecado).
 * - Token PowerSync: `accountId` (`masterId` deprecado), TTL 300 s.
 * - Fazendas: coluna `account_id` (`owner_user_id` alias). REST: accountId/accountName
 *   (ownerUserId/ownerName deprecados, ownerEmail sempre null). Admin escolhe a conta no AccountPicker.
 * - /users/masters inclui accountId. Não há rota de perfil para o basic editar a si mesmo.
 */
export const USERS_CONTRACT = {
  provisional: false,
  path: '/account/users',
  createPath: '/account/users',
  /** GET de um usuário. Ex.: '/account/users/:id'. */
  detailPath: '/account/users/:id' as string | null,
  searchParam: 'search',
  /**
   * Paginação por cursor (keyset) da lista do admin: ver src/api/usersPaging.ts (contrato, ordem id desc e fallback
   * para page/limit numa API antiga). O master e as consultas internas (detalhe, contagem de masters) seguem page/limit.
   */
  cursorParam: 'cursor',
  /** Tamanho da página no modo cursor (máx. 100 na API). */
  cursorPageLimit: 50,
  roleParam: 'role',
  /** Escopo por conta (filtro do admin na lista e campo do POST do admin). */
  scopeParam: 'accountId',
  adminScopeField: 'accountId',
  /** Perfis que podem ser criados por aqui (admin só via seed/ops). */
  creatableRoles: ['master', 'basic'] as const,
  /** Telefones no POST/PATCH: obrigatórios como no signup, nomes iguais ao RegisterUserRequest. */
  sendsPhones: true,
  /**
   * Nomes dos campos de telefone no POST, no PATCH e na leitura (lista/detalhe/resposta).
   * Iguais ao payload do signup. Se o contrato final do PATCH divergir, troque só aqui.
   */
  phoneFields: { mobile: 'mobilePhone', whatsApp: 'whatsAppPhone' } as const,
  /** PATCH /account/users/:id — ver assunções no comentário acima. */
  supportsEdit: true,
  editableFields: ['name', 'role', 'mobilePhone', 'whatsAppPhone'] as const,
  /** DELETE repetido responde 404: tratar como "já excluído" e atualizar a lista. */
  deleteNotFoundIsGone: true,
  /** Status considerado normal (outros mostram um selo discreto). */
  activeStatus: 'active',
  searchDebounceMs: 400,
  /**
   * GET /accounts: na API (12/11/2026) só page/limit (ListAccountsRequest estende PaginationQuery, ordem lower(name), id).
   * `supportsCursor: false` → vai direto em page/limit (sem gastar um 400). Quando a API ganhar keyset, trocar para true.
   */
  accounts: { path: '/accounts', searchParam: 'search', masterCountField: 'masterCount', supportsCursor: false as boolean },
}

export function clampLimit(limit?: number): number {
  const { defaultLimit, maxLimit } = RESOURCE_CONTRACT.pagination
  if (limit == null || !Number.isFinite(limit)) return defaultLimit
  return Math.min(Math.max(1, Math.trunc(limit)), maxLimit)
}

export type ListPagingRequest = {
  page?: number
  cursor?: string | null
  limit?: number
}

export type ListPage<T> = {
  items: T[]
  page?: number
  limit?: number
  total?: number
  totalPages?: number
  nextCursor?: string | null
  hasMore: boolean
  /** O cursor pedido era inválido e veio a 1ª página de novo: a lista substitui os itens (useInfiniteList). */
  restarted?: boolean
}

function asOptionalNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }
  return undefined
}

function asOptionalCursor(raw: unknown): string | null | undefined {
  if (raw == null) return raw === undefined ? undefined : null
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw
  return undefined
}

function asOptionalBoolean(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined
}

export function unwrapListPage<T>(data: unknown, requested?: ListPagingRequest): ListPage<T> {
  if (Array.isArray(data)) {
    return { items: data as T[], hasMore: false }
  }

  if (!data || typeof data !== 'object') {
    return { items: [], hasMore: false }
  }

  const record = data as Record<string, unknown>
  const items = (
    Array.isArray(record.data) ? record.data : Array.isArray(record.items) ? record.items : Array.isArray(record.results) ? record.results : []
  ) as T[]

  const meta = record.meta && typeof record.meta === 'object' ? (record.meta as Record<string, unknown>) : undefined
  const page = asOptionalNumber(meta?.page ?? record.page) ?? requested?.page
  const limit = asOptionalNumber(meta?.limit ?? record.limit) ?? requested?.limit
  const total = asOptionalNumber(meta?.total ?? record.total)
  const reportedTotalPages = asOptionalNumber(meta?.totalPages ?? meta?.total_pages ?? record.totalPages)
  const totalPages =
    reportedTotalPages ?? (total != null && limit != null && limit > 0 ? Math.ceil(total / limit) : undefined)
  const nextCursor = asOptionalCursor(meta?.nextCursor ?? meta?.next_cursor ?? record.nextCursor ?? record.next_cursor)
  const explicitHasMore = asOptionalBoolean(
    meta?.hasMore ?? meta?.hasNextPage ?? meta?.has_next_page ?? record.hasMore ?? record.hasNextPage,
  )

  let hasMore = false
  if (explicitHasMore !== undefined) {
    hasMore = explicitHasMore
  } else if (nextCursor) {
    hasMore = true
  } else if (totalPages != null && page != null) {
    hasMore = page < totalPages
  } else if (total != null && page != null && limit != null) {
    hasMore = page * limit < total
  } else if (total != null && limit != null && items.length > 0) {
    const currentPage = page ?? requested?.page ?? RESOURCE_CONTRACT.pagination.firstPage
    hasMore = (currentPage - RESOURCE_CONTRACT.pagination.firstPage) * limit + items.length < total
  } else {
    hasMore = false
  }

  return { items, page, limit, total, totalPages, nextCursor: nextCursor ?? null, hasMore }
}

export function unwrapList<T>(data: unknown): T[] {
  return unwrapListPage<T>(data).items
}

export function compactParams(params?: Record<string, string | number | undefined>) {
  if (!params) return undefined
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') out[key] = value
  }
  return Object.keys(out).length ? out : undefined
}

export function paginationParams(paging: ListPagingRequest = {}): Record<string, string | number> {
  const { pagination } = RESOURCE_CONTRACT
  const limit = clampLimit(paging.limit)
  return compactParams({
    [pagination.pageParam]: paging.page ?? pagination.firstPage,
    [pagination.limitParam]: limit,
  }) ?? { [pagination.pageParam]: pagination.firstPage, [pagination.limitParam]: limit }
}

function requestedFromParams(params?: Record<string, string | number | undefined>): ListPagingRequest {
  const { pagination } = RESOURCE_CONTRACT
  const rawPage = params?.[pagination.pageParam]
  const rawLimit = params?.[pagination.limitParam]
  return {
    page: asOptionalNumber(rawPage),
    limit: asOptionalNumber(rawLimit) != null ? clampLimit(asOptionalNumber(rawLimit)) : undefined,
  }
}

export function createResourceClient<T>(path: string, parse: (raw: unknown) => T) {
  return {
    list(params?: Record<string, string | number | undefined>) {
      const compact = compactParams(params)
      return http.get(path, { params: compact }).then((res) => {
        const page = unwrapListPage(res.data, requestedFromParams(compact))
        return { ...page, items: page.items.map((item) => parse(item)) }
      })
    },
    get(id: string) {
      return http.get(`${path}/${id}`).then((res) => parse(res.data))
    },
    create(body: unknown) {
      return http.post(path, body).then((res) => parse(res.data))
    },
    update(id: string, body: unknown) {
      return http[RESOURCE_CONTRACT.updateMethod](`${path}/${id}`, body).then((res) => parse(res.data))
    },
    remove(id: string) {
      return http.delete(`${path}/${id}`).then((res) => res.data)
    },
  }
}

export async function listAllPages<T>(
  list: (params?: Record<string, string | number | undefined>) => Promise<ListPage<T>>,
  filters?: Record<string, string | number | undefined>,
  maxPages = 50,
): Promise<T[]> {
  const collected: T[] = []
  const { pagination } = RESOURCE_CONTRACT
  let page = pagination.firstPage
  const limit = clampLimit(pagination.defaultLimit)

  for (let index = 0; index < maxPages; index += 1) {
    const result = await list({ ...filters, ...paginationParams({ page, limit }) })
    collected.push(...result.items)
    if (!result.hasMore) break
    page += 1
  }

  return collected
}

export function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

export function asString(raw: unknown, fallback = ''): string {
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number') return String(raw)
  return fallback
}

export function asNullableString(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  return String(raw)
}

export function asNumber(raw: unknown, fallback = 0): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

/* -------------------------------------------------------------------------- */
/* Lançamentos de vacina (vacinações) e carência                               */
/* -------------------------------------------------------------------------- */

/**
 * Contrato de lançamentos de vacina (API_INTEGRATION.md §18).
 *
 * - GET    /api/v1/vaccinations?date=YYYY-MM-DD&dateFrom=&dateTo=&farmId=&code=&page=&limit=
 *          → { data: VaccinationEntry[], meta }  (params vazios são omitidos)
 *          `date` não combina com `dateFrom`/`dateTo` (400 INVALID_DATE_FILTER). Ordem: appliedAt desc.
 * - GET    /api/v1/vaccinations/:id → VaccinationEntry
 * - POST   /api/v1/vaccinations { animalId, vaccineId, appliedAt } → VaccinationEntry
 * - PATCH  /api/v1/vaccinations/:id { animalId?, vaccineId?, appliedAt? } → VaccinationEntry
 * - DELETE /api/v1/vaccinations/:id (204)
 * - Todos os papéis (admin, master, basic) podem criar, editar e excluir (escopo da fazenda do animal).
 * - `withdrawalUntil` = appliedAt + withdrawalDays (sem +1). O animal já está livre NO dia `withdrawalUntil`.
 *   O valor oficial vem da API; o app só mostra uma prévia.
 *
 * Busca de animais no seletor: GET /animals?code=&page=&limit= (parcial, sem diferenciar maiúsculas).
 *
 * Carência do animal:
 * - Todo animal (lista e GET /:id) traz no topo `totalWithdrawalDays`, `freeAt`, `inWithdrawal`.
 * - GET /animals/:id traz também `withdrawal: { applications: [{ id, vaccineId, vaccineName, appliedAt,
 *   withdrawalDays, withdrawalUntil, active }], totalWithdrawalDays, freeAt, inWithdrawal }`.
 * - `active` = hoje < withdrawalUntil; `inWithdrawal` = hoje < freeAt; `totalWithdrawalDays` soma TODAS as
 *   aplicações (informativo). O status vem de `inWithdrawal`/`freeAt`.
 *
 * 409: VACCINE_HAS_APPLICATIONS (excluir vacina aplicada), ANIMAL_HAS_VACCINATIONS (excluir animal vacinado).
 */
export const VACCINATION_CONTRACT = {
  path: '/vaccinations',
  filters: {
    date: 'date',
    dateFrom: 'dateFrom',
    dateTo: 'dateTo',
    farmId: 'farmId',
    code: 'code',
  },
  animalSearchParam: 'code',
  withdrawalField: 'withdrawal',
  /** Debounce da busca por código (ms). */
  searchDebounceMs: 400,
} as const

export type VaccinationEntry = {
  id: string
  animalId: string
  animalCode: string
  farmId: string
  farmName: string
  animalTypeName: string
  vaccineId: string
  vaccineName: string
  /** YYYY-MM-DD */
  appliedAt: string
  withdrawalDays: number
  /** YYYY-MM-DD */
  withdrawalUntil: string
  createdByUserId: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type VaccinationPayload = {
  animalId: string
  vaccineId: string
  /** YYYY-MM-DD */
  appliedAt: string
}

export type VaccinationFilters = {
  /** Um dia exato. Não combine com dateFrom/dateTo. */
  date?: string
  /** Intervalo inclusivo (pode usar só um lado). */
  dateFrom?: string
  dateTo?: string
  farmId?: string
  code?: string
}

export type WithdrawalApplication = {
  id: string
  vaccineId: string | null
  vaccineName: string
  appliedAt: string
  withdrawalDays: number
  withdrawalUntil: string
  active: boolean
}

export type AnimalWithdrawal = {
  applications: WithdrawalApplication[]
  totalWithdrawalDays: number
  freeAt: string | null
  inWithdrawal: boolean
}

/** Normaliza data da API (YYYY-MM-DD ou ISO com hora) para YYYY-MM-DD. */
export function asIsoDate(raw: unknown): string {
  const value = asString(raw).trim()
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match ? match[1] : ''
}

function asNullableIsoDate(raw: unknown): string | null {
  return asIsoDate(raw) || null
}

function nestedField(raw: unknown, field: string): string {
  return asString(asRecord(raw)[field])
}

export function parseVaccinationEntry(raw: unknown): VaccinationEntry {
  const record = asRecord(raw)
  const animal = record.animal
  const vaccine = record.vaccine
  const farm = record.farm ?? asRecord(animal).farm
  const animalType = record.animalType ?? asRecord(animal).animalType
  return {
    id: asString(record.id),
    animalId: asString(record.animalId) || nestedField(animal, 'id'),
    animalCode: asString(record.animalCode) || nestedField(animal, 'code'),
    farmId: asString(record.farmId) || nestedField(farm, 'id') || nestedField(animal, 'farmId'),
    farmName: asString(record.farmName) || nestedField(farm, 'name'),
    animalTypeName: asString(record.animalTypeName) || nestedField(animalType, 'name'),
    vaccineId: asString(record.vaccineId) || nestedField(vaccine, 'id'),
    vaccineName: asString(record.vaccineName) || nestedField(vaccine, 'name'),
    appliedAt: asIsoDate(record.appliedAt),
    withdrawalDays: asNumber(record.withdrawalDays ?? asRecord(vaccine).withdrawalDays),
    withdrawalUntil: asIsoDate(record.withdrawalUntil),
    createdByUserId: asNullableString(record.createdByUserId),
    createdAt: asNullableString(record.createdAt),
    updatedAt: asNullableString(record.updatedAt),
  }
}

/** Mesma regra da API: em carência enquanto hoje < withdrawalUntil (livre NO próprio dia). */
export function isWithdrawalActive(withdrawalUntil: string | null | undefined): boolean {
  return Boolean(withdrawalUntil) && todayIsoLocal() < (withdrawalUntil as string)
}

function parseWithdrawalApplication(raw: unknown): WithdrawalApplication {
  const record = asRecord(raw)
  const vaccine = record.vaccine
  const withdrawalUntil = asIsoDate(record.withdrawalUntil)
  const active =
    typeof record.active === 'boolean'
      ? record.active
      : isWithdrawalActive(withdrawalUntil)
  return {
    id: asString(record.id),
    vaccineId: asNullableString(record.vaccineId ?? asRecord(vaccine).id),
    vaccineName: asString(record.vaccineName) || nestedField(vaccine, 'name'),
    appliedAt: asIsoDate(record.appliedAt),
    withdrawalDays: asNumber(record.withdrawalDays ?? asRecord(vaccine).withdrawalDays),
    withdrawalUntil,
    active,
  }
}

function todayIsoLocal(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Lê o bloco `withdrawal` de forma defensiva. Retorna null se a API ainda não o enviar. */
export function parseAnimalWithdrawal(raw: unknown): AnimalWithdrawal | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const rawApplications = Array.isArray(record.applications)
    ? record.applications
    : Array.isArray(record.vaccinations)
      ? record.vaccinations
      : []
  const applications = rawApplications.map(parseWithdrawalApplication)
  const totalWithdrawalDays =
    record.totalWithdrawalDays != null
      ? asNumber(record.totalWithdrawalDays)
      : applications.reduce((sum, item) => sum + item.withdrawalDays, 0)
  const freeAt = asNullableIsoDate(record.freeAt)
  const inWithdrawal =
    typeof record.inWithdrawal === 'boolean'
      ? record.inWithdrawal
      : freeAt != null
        ? todayIsoLocal() < freeAt
        : applications.some((item) => item.active)
  return { applications, totalWithdrawalDays, freeAt, inWithdrawal }
}

export type WithdrawalSummary = {
  inWithdrawal: boolean
  freeAt: string | null
  totalWithdrawalDays: number
}

/** Resumo para o selo na listagem: campos no topo do animal (lista e GET /:id). */
export function parseWithdrawalSummary(raw: unknown): WithdrawalSummary | null {
  const record = asRecord(raw)
  const block = asRecord(record[VACCINATION_CONTRACT.withdrawalField])
  const inWithdrawal = typeof record.inWithdrawal === 'boolean' ? record.inWithdrawal : block.inWithdrawal
  if (typeof inWithdrawal !== 'boolean') return null
  return {
    inWithdrawal,
    freeAt: asNullableIsoDate(record.freeAt ?? block.freeAt),
    totalWithdrawalDays: asNumber(record.totalWithdrawalDays ?? block.totalWithdrawalDays),
  }
}
