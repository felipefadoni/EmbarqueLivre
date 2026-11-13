import { http } from './client'
import { unwrapListPage, RESOURCE_CONTRACT, type ListPagingRequest } from './contract'
import { fetchCursorPage, pagingParams, withFilters, type PagingState } from './cursorPaging'

export type MasterUser = {
  id: string
  name: string
  email: string
  accountId: string | null
}

function parseMaster(raw: unknown): MasterUser {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: typeof record.id === 'string' ? record.id : String(record.id ?? ''),
    name: typeof record.name === 'string' ? record.name : String(record.name ?? ''),
    email: typeof record.email === 'string' ? record.email : String(record.email ?? ''),
    accountId: typeof record.accountId === 'string' && record.accountId ? record.accountId : null,
  }
}

/** Modo da paginação de /users/masters (ver cursorPaging.ts): page/limit enquanto a API não tiver keyset. */
const mastersPaging: PagingState = { mode: RESOURCE_CONTRACT.masters.supportsCursor ? 'cursor' : 'legacy' }

export function listMasters(params: ListPagingRequest & { search?: string } = {}) {
  const { search, ...paging } = params
  return fetchCursorPage(
    (query) => http.get(RESOURCE_CONTRACT.masters.path, { params: query }).then((res) => res.data as unknown),
    (mode, request) => withFilters(pagingParams(request, mode), { [RESOURCE_CONTRACT.masters.searchParam]: search }),
    paging,
    mastersPaging,
  ).then(({ data, restarted }) => {
    const page = unwrapListPage(data, { page: restarted ? 1 : paging.page, limit: paging.limit })
    return { ...page, items: page.items.map((item) => parseMaster(item)), restarted }
  })
}
