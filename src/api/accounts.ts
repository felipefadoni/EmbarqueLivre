/** Contas (admin): GET /accounts?search&page → { id, name, masterCount, createdAt }. Online, não sincronizado. */
import { http } from './client'
import { unwrapListPage, USERS_CONTRACT, type ListPagingRequest } from './contract'
import { fetchCursorPage, pagingParams, withFilters, type PagingState } from './cursorPaging'

export type Account = { id: string; name: string; masterCount: number | null; createdAt: string | null }

export function parseAccount(raw: unknown): Account {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const count = r[USERS_CONTRACT.accounts.masterCountField]
  return {
    id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
    name: typeof r.name === 'string' ? r.name : String(r.name ?? ''),
    masterCount: typeof count === 'number' && Number.isFinite(count) ? count : null,
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : null,
  }
}

/** Último masterCount visto por conta (alimenta o aviso de "último master" quando conhecido). */
const masterCounts = new Map<string, number>()
export const knownMasterCount = (accountId: string | null | undefined) =>
  accountId ? (masterCounts.get(accountId) ?? null) : null

/** Modo da paginação de /accounts (ver cursorPaging.ts): page/limit enquanto a API não tiver keyset. */
const accountsPaging: PagingState = { mode: USERS_CONTRACT.accounts.supportsCursor ? 'cursor' : 'legacy' }

export function listAccounts(params: ListPagingRequest & { search?: string } = {}) {
  const { search, ...paging } = params
  return fetchCursorPage(
    (query) => http.get(USERS_CONTRACT.accounts.path, { params: query }).then((res) => res.data as unknown),
    (mode, request) => withFilters(pagingParams(request, mode), { [USERS_CONTRACT.accounts.searchParam]: search }),
    paging,
    accountsPaging,
  ).then(({ data, restarted }) => {
    const page = unwrapListPage(data, { page: restarted ? 1 : paging.page, limit: paging.limit })
    const items = page.items.map(parseAccount)
    for (const item of items) if (item.id && item.masterCount != null) masterCounts.set(item.id, item.masterCount)
    return { ...page, items, restarted }
  })
}
