import { http } from './client'
import {
  compactParams,
  paginationParams,
  unwrapListPage,
  RESOURCE_CONTRACT,
  type ListPagingRequest,
} from './contract'

export type MasterUser = {
  id: string
  name: string
  email: string
}

function parseMaster(raw: unknown): MasterUser {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: typeof record.id === 'string' ? record.id : String(record.id ?? ''),
    name: typeof record.name === 'string' ? record.name : String(record.name ?? ''),
    email: typeof record.email === 'string' ? record.email : String(record.email ?? ''),
  }
}

export function listMasters(params: ListPagingRequest & { search?: string } = {}) {
  const { search, ...paging } = params
  const query = compactParams({
    ...paginationParams(paging),
    [RESOURCE_CONTRACT.masters.searchParam]: search?.trim() || undefined,
  })
  return http.get(RESOURCE_CONTRACT.masters.path, { params: query }).then((res) => {
    const page = unwrapListPage(res.data, paging)
    return { ...page, items: page.items.map((item) => parseMaster(item)) }
  })
}
