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
  },
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
