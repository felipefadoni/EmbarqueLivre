/**
 * Cliente REST de usuários da conta (ONLINE, não sincronizado). Contrato proposto: USERS_CONTRACT.
 */
import { knownMasterCount } from './accounts'
import { http } from './client'
import { compactParams, paginationParams, unwrapListPage, USERS_CONTRACT, type ListPagingRequest } from './contract'
import { isApiError } from './errors'
import type { UserRole } from './types'
import { parseCreatedBy, type UserCreatedBy } from './userAuthor'
import { fetchUsersPage, type UsersFilters, type UsersPagingState } from './usersPaging'

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
  /**
   * Quem cadastrou (só admin vê). `undefined` = a API ainda não envia o campo (esconder);
   * `null` = sem autor registrado.
   */
  createdBy?: UserCreatedBy | null
  /** Mesmos nomes do signup; null se a API não enviar. */
  mobilePhone: string | null
  whatsAppPhone: string | null
}

const str = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value))
const nullableStr = (value: unknown) => (typeof value === 'string' && value ? value : null)

function phoneFrom(r: Record<string, unknown>, key: string, aliases: string[] = []): string | null {
  const keys = [key, ...aliases]
  for (const k of keys) {
    const value = nullableStr(r[k])
    if (value) return value
  }
  return null
}

export function parseAccountUser(raw: unknown): AccountUser {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const role = str(r.role)
  const { mobile, whatsApp } = USERS_CONTRACT.phoneFields
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
    ...parseCreatedBy(r),
    mobilePhone: phoneFrom(r, mobile, ['mobile_phone']),
    whatsAppPhone: phoneFrom(r, whatsApp, ['whatsappPhone', 'whats_app_phone', 'whatsapp_phone']),
  }
}

/** Itens já vistos na lista; o detalhe prefere o cache e, se faltar, GET /account/users/:id. */
const userCache = new Map<string, AccountUser>()
export const cachedUser = (id: string) => userCache.get(id) ?? null
export const forgetUser = (id: string) => void userCache.delete(id)

export type ListUsersParams = ListPagingRequest & { search?: string; accountId?: string; role?: CreatableRole }

/** page/limit (master, detalhe, contagem de masters): mesma consulta de antes. */
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

/** Modo da paginação da lista do admin; cai para 'legacy' (e fica) se a API ainda não tiver o keyset. */
const usersPaging: UsersPagingState = { mode: 'cursor' }

/**
 * Lista do ADMIN em modo cursor (keyset, mais novos primeiro), com os fallbacks de usersPaging.ts.
 * Filtros do servidor: os de UsersFilters (a tela manda só `email`; o nome é filtrado no aparelho, ver userFilters.ts).
 */
export function listUsersCursor(params: ListPagingRequest & UsersFilters) {
  const { page, cursor, limit, ...filters } = params
  return fetchUsersPage(
    (query) => http.get(USERS_CONTRACT.path, { params: query }).then((res) => res.data as unknown),
    filters,
    { page, cursor, limit: limit ?? USERS_CONTRACT.cursorPageLimit },
    usersPaging,
  ).then(({ data, restarted }) => {
    const page = unwrapListPage(data, { page: restarted ? 1 : params.page, limit: limit ?? USERS_CONTRACT.cursorPageLimit })
    const items = page.items.map(parseAccountUser)
    for (const item of items) if (item.id) userCache.set(item.id, item)
    return { ...page, items, restarted }
  })
}

export type CreateUserPayload = {
  name: string
  email: string
  password: string
  role: CreatableRole
  accountId?: string
  mobilePhone?: string
  whatsAppPhone?: string
}

export function createUserBody(payload: CreateUserPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: payload.name.trim().replace(/\s+/g, ' '),
    email: payload.email.trim().toLowerCase(),
    password: payload.password, // senha nunca é aparada (mesma regra do cadastro)
    role: payload.role,
  }
  if (payload.accountId) body[USERS_CONTRACT.adminScopeField] = payload.accountId
  if (USERS_CONTRACT.sendsPhones) {
    body[USERS_CONTRACT.phoneFields.mobile] = payload.mobilePhone ?? ''
    body[USERS_CONTRACT.phoneFields.whatsApp] = payload.whatsAppPhone ?? ''
  }
  return body
}

export function createUser(payload: CreateUserPayload) {
  return http.post(USERS_CONTRACT.createPath, createUserBody(payload)).then((res) => parseAccountUser(res.data))
}

const userUrl = (id: string) => `${USERS_CONTRACT.path}/${encodeURIComponent(id)}`

/**
 * Detalhe: cache da lista → GET /account/users/:id (`detailPath`) → busca na lista pelo email/nome (hint) conferindo o id.
 * null = não encontrado (excluído, de outra conta, ou admin).
 */
export async function findUser(id: string, hint?: string): Promise<AccountUser | null> {
  const cached = cachedUser(id)
  if (cached) return cached
  if (USERS_CONTRACT.detailPath) {
    try {
      const res = await http.get(USERS_CONTRACT.detailPath.replace(':id', encodeURIComponent(id)))
      const user = parseAccountUser(res.data)
      if (user.id) userCache.set(user.id, user)
      return user
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

export type UpdateUserPayload = {
  name?: string
  role?: CreatableRole
  mobilePhone?: string
  whatsAppPhone?: string
}

/**
 * Monta o body do PATCH com as chaves de USERS_CONTRACT (phoneFields / editableFields).
 * Só inclui o que foi passado; telefones usam os mesmos nomes do signup.
 */
export function updateUserBody(payload: UpdateUserPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (payload.name !== undefined) body.name = payload.name.trim().replace(/\s+/g, ' ')
  if (payload.role !== undefined) body.role = payload.role
  if (USERS_CONTRACT.sendsPhones) {
    if (payload.mobilePhone !== undefined) body[USERS_CONTRACT.phoneFields.mobile] = payload.mobilePhone
    if (payload.whatsAppPhone !== undefined) body[USERS_CONTRACT.phoneFields.whatsApp] = payload.whatsAppPhone
  }
  return body
}

/** PATCH /account/users/:id (só com USERS_CONTRACT.supportsEdit). */
export function updateUser(id: string, payload: UpdateUserPayload) {
  return http.patch(userUrl(id), updateUserBody(payload)).then((res) => {
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
