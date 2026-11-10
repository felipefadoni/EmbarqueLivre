/**
 * Cliente REST de usuários da conta (ONLINE, não sincronizado). Contrato proposto: USERS_CONTRACT.
 */
import { knownMasterCount } from './accounts'
import { http } from './client'
import { compactParams, paginationParams, unwrapListPage, USERS_CONTRACT, type ListPagingRequest } from './contract'
import { isApiError } from './errors'
import type { UserRole } from './types'

export type CreatableRole = (typeof USERS_CONTRACT.creatableRoles)[number]

export type AccountUser = {
  id: string
  accountId: string | null
  name: string
  email: string
  role: UserRole
  status: string | null
  canAccess: boolean
  createdByUserId: string | null
  createdAt: string | null
  updatedAt: string | null
}

const str = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value))
const nullableStr = (value: unknown) => (typeof value === 'string' && value ? value : null)

export function parseAccountUser(raw: unknown): AccountUser {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const role = str(r.role)
  return {
    id: str(r.id ?? r.userId),
    accountId: nullableStr(r.accountId),
    name: str(r.name),
    email: str(r.email),
    role: role === 'admin' || role === 'master' || role === 'basic' ? role : 'basic',
    status: nullableStr(r.status),
    canAccess: r.canAccess !== false,
    createdByUserId: nullableStr(r.createdByUserId),
    createdAt: nullableStr(r.createdAt),
    updatedAt: nullableStr(r.updatedAt),
  }
}

/** Itens já vistos na lista: o detalhe abre daqui (não há GET /account/users/:id). */
const userCache = new Map<string, AccountUser>()
export const cachedUser = (id: string) => userCache.get(id) ?? null
export const forgetUser = (id: string) => void userCache.delete(id)

export type ListUsersParams = ListPagingRequest & { search?: string; accountId?: string; role?: CreatableRole }

export function listUsersQuery(params: ListUsersParams = {}) {
  const { search, accountId, role, ...paging } = params
  return compactParams({
    ...paginationParams(paging),
    [USERS_CONTRACT.searchParam]: search?.trim() || undefined,
    [USERS_CONTRACT.roleParam]: role,
    [USERS_CONTRACT.scopeParam]: accountId || undefined,
  })
}

export function listUsers(params: ListUsersParams = {}) {
  return http.get(USERS_CONTRACT.path, { params: listUsersQuery(params) }).then((res) => {
    const page = unwrapListPage(res.data, params)
    const items = page.items.map(parseAccountUser)
    for (const item of items) if (item.id) userCache.set(item.id, item)
    return { ...page, items }
  })
}

export type CreateUserPayload = { name: string; email: string; password: string; role: CreatableRole; accountId?: string }

export function createUserBody(payload: CreateUserPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: payload.name.trim().replace(/\s+/g, ' '),
    email: payload.email.trim().toLowerCase(),
    password: payload.password, // senha nunca é aparada (mesma regra do cadastro)
    role: payload.role,
  }
  if (payload.accountId) body[USERS_CONTRACT.adminScopeField] = payload.accountId
  // USERS_CONTRACT.sendsPhones: quando o Felipe decidir, incluir mobilePhone/whatsAppPhone aqui (opcionais).
  return body
}

export function createUser(payload: CreateUserPayload) {
  return http.post(USERS_CONTRACT.createPath, createUserBody(payload)).then((res) => parseAccountUser(res.data))
}

const userUrl = (id: string) => `${USERS_CONTRACT.path}/${encodeURIComponent(id)}`

/**
 * Detalhe: cache da lista → GET (se `detailPath` existir) → busca na lista pelo email/nome (hint) conferindo o id.
 * null = não encontrado (excluído, de outra conta, ou admin).
 */
export async function findUser(id: string, hint?: string): Promise<AccountUser | null> {
  const cached = cachedUser(id)
  if (cached) return cached
  if (USERS_CONTRACT.detailPath) {
    try {
      const res = await http.get(USERS_CONTRACT.detailPath.replace(':id', encodeURIComponent(id)))
      return parseAccountUser(res.data)
    } catch (error) {
      if (isApiError(error) && error.status === 404) return null
      throw error
    }
  }
  const page = await listUsers({ search: hint || undefined, page: 1, limit: 100 })
  return page.items.find((item) => item.id === id) ?? null
}

/** 'deleted' (204) ou 'gone' (404 depois de um DELETE: já excluído). Outros erros sobem. */
export async function deleteUser(id: string): Promise<'deleted' | 'gone'> {
  try {
    await http.delete(userUrl(id))
    forgetUser(id)
    return 'deleted'
  } catch (error) {
    if (USERS_CONTRACT.deleteNotFoundIsGone && isApiError(error) && error.status === 404) {
      forgetUser(id)
      return 'gone'
    }
    throw error
  }
}

export type UpdateUserPayload = { name?: string; role?: CreatableRole }

/** PATCH proposto (só com USERS_CONTRACT.supportsEdit). */
export function updateUser(id: string, payload: UpdateUserPayload) {
  const body = compactParams({ name: payload.name?.trim().replace(/\s+/g, ' '), role: payload.role })
  return http.patch(userUrl(id), body).then((res) => {
    const user = parseAccountUser(res.data)
    if (user.id) userCache.set(user.id, user)
    return user
  })
}

/** Masters da conta: masterCount conhecido (GET /accounts) ou role=master&limit=2 no accountId. null = desconhecido. */
export async function countAccountMasters(accountId: string | null): Promise<number | null> {
  if (!accountId) return null
  const known = knownMasterCount(accountId)
  if (known != null) return known
  try {
    const page = await listUsers({ accountId, role: 'master', page: 1, limit: 2 })
    return page.total ?? page.items.filter((item) => item.role === 'master').length
  } catch {
    return null // o backend decide (LAST_MASTER)
  }
}
