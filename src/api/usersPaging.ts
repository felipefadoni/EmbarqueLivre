/**
 * Paginação da lista de Usuários (GET /account/users). Puro (sem cliente HTTP), testável no Node.
 *
 * Contrato (API, 12/11/2026): keyset — 1ª página `?pagination=cursor&limit=N` (máx. 100), próximas
 * `?cursor=<nextCursor>&limit=N` com os MESMOS filtros; resposta `{ data, nextCursor }` (null no fim, sem total).
 * Ordem: id (ULID) desc = mais novos primeiro. Cursor opaco; inválido → 400 INVALID_CURSOR.
 * Modo antigo (page/limit → `{ data, meta }`) continua existindo.
 *
 * Compatibilidade com uma API ainda não atualizada (forbidNonWhitelisted → 400 em parâmetro desconhecido):
 * - 400 de validação citando `pagination`/`cursor`/`name`/`email` → refaz a MESMA página no modo antigo
 *   (search + page/limit) e fica no modo antigo até o app reiniciar;
 * - resposta com `meta` em vez de `nextCursor` → segue em page/limit.
 * - 400 INVALID_CURSOR → recomeça da 1ª página (sem cursor) e avisa (`restarted`) para a lista substituir os itens.
 */

export type UsersPagingMode = 'cursor' | 'legacy'

export type UsersFilters = {
  /** Nome OU e-mail (busca única do master). */
  search?: string
  /** E-mail contém (sem diferenciar maiúsculas). */
  email?: string
  /** Nome contém. ATENÇÃO: no servidor diferencia acentos (lower LIKE); ver userFilters.ts. */
  name?: string
  role?: string
  accountId?: string
}

export type UsersPageRequest = { page?: number; cursor?: string | null; limit?: number }

export const USERS_PAGING = {
  modeParam: 'pagination',
  cursorMode: 'cursor',
  cursorParam: 'cursor',
  pageParam: 'page',
  limitParam: 'limit',
  firstPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
  /** Parâmetros que uma API antiga recusaria (400 "property X should not exist"). */
  newParams: ['pagination', 'cursor', 'name', 'email'],
  invalidCursorCode: 'INVALID_CURSOR',
} as const

export function clampUsersLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return USERS_PAGING.defaultLimit
  return Math.min(Math.max(1, Math.trunc(limit)), USERS_PAGING.maxLimit)
}

function put(out: Record<string, string | number>, key: string, value: string | number | null | undefined) {
  if (value === undefined || value === null) return
  const v = typeof value === 'string' ? value.trim() : value
  if (v !== '') out[key] = v
}

/** Query string da página pedida no modo dado. Sem cursor no modo cursor = 1ª página (`pagination=cursor`). */
export function usersQueryParams(filters: UsersFilters, paging: UsersPageRequest, mode: UsersPagingMode): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  const limit = clampUsersLimit(paging.limit)
  if (mode === 'cursor') {
    if (paging.cursor) put(out, USERS_PAGING.cursorParam, paging.cursor)
    else put(out, USERS_PAGING.modeParam, USERS_PAGING.cursorMode)
    put(out, USERS_PAGING.limitParam, limit)
    put(out, 'search', filters.search)
    put(out, 'name', filters.name)
    put(out, 'email', filters.email)
  } else {
    put(out, USERS_PAGING.pageParam, paging.page ?? USERS_PAGING.firstPage)
    put(out, USERS_PAGING.limitParam, limit)
    // API antiga: só `search` (nome OU e-mail). O e-mail vai nele; o nome fica no filtro do aparelho.
    put(out, 'search', filters.search?.trim() || filters.email)
  }
  put(out, 'role', filters.role)
  put(out, 'accountId', filters.accountId)
  return out
}

/** Formato da resposta: `nextCursor` → keyset; `meta` → page/limit; outro → null. */
export function responseMode(data: unknown): UsersPagingMode | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if ('nextCursor' in data) return 'cursor'
  if ('meta' in data) return 'legacy'
  return null
}

type ErrorLike = { status?: unknown; code?: unknown; fieldErrors?: unknown }

/** 400 de validação de uma API antiga recusando um parâmetro novo (pagination/cursor/name/email). */
export function isUnknownParamRejection(error: unknown): boolean {
  const e = (error ?? {}) as ErrorLike
  if (e.status !== 400 || e.code !== 'VALIDATION_ERROR') return false
  const fields = e.fieldErrors && typeof e.fieldErrors === 'object' ? (e.fieldErrors as Record<string, unknown>) : {}
  return (USERS_PAGING.newParams as readonly string[]).some((param) => {
    if (param in fields) return true
    return Object.values(fields).some(
      (messages) => Array.isArray(messages) && messages.some((m) => String(m).startsWith(`property ${param} should not exist`)),
    )
  })
}

export function isInvalidCursor(error: unknown): boolean {
  const e = (error ?? {}) as ErrorLike
  return e.code === USERS_PAGING.invalidCursorCode
}

export type UsersPagingState = { mode: UsersPagingMode }

export type UsersFetchResult = {
  data: unknown
  /** Modo efetivo desta página. */
  mode: UsersPagingMode
  /** A página pedida tinha cursor inválido: veio a 1ª página de novo (substituir a lista). */
  restarted: boolean
}

/**
 * Busca uma página com os fallbacks acima. `state` é compartilhado (o modo antigo "gruda" na sessão).
 * `get` recebe os query params e devolve o corpo da resposta (lança o erro normalizado da API).
 */
export async function fetchUsersPage(
  get: (params: Record<string, string | number>) => Promise<unknown>,
  filters: UsersFilters,
  paging: UsersPageRequest,
  state: UsersPagingState,
): Promise<UsersFetchResult> {
  let restarted = false
  let request: UsersPageRequest = state.mode === 'cursor' ? paging : { ...paging, cursor: null }
  let data: unknown
  try {
    data = await get(usersQueryParams(filters, request, state.mode))
  } catch (error) {
    if (state.mode === 'cursor' && isUnknownParamRejection(error)) {
      state.mode = 'legacy'
      request = { ...paging, cursor: null }
      data = await get(usersQueryParams(filters, request, 'legacy'))
    } else if (state.mode === 'cursor' && request.cursor && isInvalidCursor(error)) {
      restarted = true
      request = { page: USERS_PAGING.firstPage, cursor: null, limit: paging.limit }
      data = await get(usersQueryParams(filters, request, 'cursor'))
    } else {
      throw error
    }
  }
  if (state.mode === 'cursor' && responseMode(data) === 'legacy') state.mode = 'legacy'
  return { data, mode: state.mode, restarted }
}
