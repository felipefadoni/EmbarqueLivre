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

import {
  clampLimit,
  CURSOR_PAGING,
  fetchCursorPage,
  isInvalidCursor,
  isUnknownParamRejection as isUnknownParam,
  pagingParams,
  responseMode,
  withFilters,
  type CursorFetchResult,
  type PageRequest,
  type PagingMode,
  type PagingState,
} from './cursorPaging'

export { isInvalidCursor, responseMode }
export type UsersPagingMode = PagingMode
export type UsersPageRequest = PageRequest
export type UsersPagingState = PagingState
export type UsersFetchResult = CursorFetchResult

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

export const USERS_PAGING = {
  ...CURSOR_PAGING,
  /** Parâmetros que uma API antiga recusaria (400 "property X should not exist"). */
  newParams: ['pagination', 'cursor', 'name', 'email'],
} as const

export const clampUsersLimit = clampLimit

/** Query string da página pedida no modo dado. Sem cursor no modo cursor = 1ª página (`pagination=cursor`). */
export function usersQueryParams(filters: UsersFilters, paging: UsersPageRequest, mode: UsersPagingMode): Record<string, string | number> {
  const base = pagingParams(paging, mode)
  const own =
    mode === 'cursor'
      ? { search: filters.search, name: filters.name, email: filters.email }
      : // API antiga: só `search` (nome OU e-mail). O e-mail vai nele; o nome fica no filtro do aparelho.
        { search: filters.search?.trim() || filters.email }
  return withFilters(base, { ...own, role: filters.role, accountId: filters.accountId })
}

/** 400 de validação de uma API antiga recusando um parâmetro novo (pagination/cursor/name/email). */
export function isUnknownParamRejection(error: unknown): boolean {
  return isUnknownParam(error, USERS_PAGING.newParams)
}

/** Busca uma página da lista de usuários (ver cursorPaging.ts). */
export function fetchUsersPage(
  get: (params: Record<string, string | number>) => Promise<unknown>,
  filters: UsersFilters,
  paging: UsersPageRequest,
  state: UsersPagingState,
): Promise<UsersFetchResult> {
  return fetchCursorPage(get, (mode, request) => usersQueryParams(filters, request, mode), paging, state, USERS_PAGING.newParams)
}
