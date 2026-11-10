import axios, { AxiosError, create, type InternalAxiosRequestConfig } from 'axios'

import { toApiError } from './errors'
import { deleteSecureItem, getSecureItem, setSecureItem } from './storage'
import { normalizeAuthUser, type AuthUser, type LoginRequest, type MeResponse, type MobileSessionResponse, type RegisterUserRequest, type UserResponse } from './types'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const KEYS = { access: 'el.accessToken', refresh: 'el.refreshToken', accessExp: 'el.accessExp', user: 'el.user' } as const

let accessToken: string | null = null
let accessExpiresAt = 0
let refreshing: Promise<string | null> | null = null
let onLoggedOut: () => void = () => {}

export const setOnLoggedOut = (fn: () => void) => {
  onLoggedOut = fn
}

export const http = create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 15_000,
  withCredentials: false,
})

async function saveSession(session: MobileSessionResponse) {
  // Salve o NOVO refresh token primeiro: o anterior já foi invalidado pela rotação.
  await setSecureItem(KEYS.refresh, session.refreshToken)
  await setSecureItem(KEYS.access, session.accessToken)
  await setSecureItem(KEYS.accessExp, session.accessTokenExpiresAt)
  const user = normalizeAuthUser(session.user) ?? session.user
  await setSecureItem(KEYS.user, JSON.stringify(user))
  accessToken = session.accessToken
  accessExpiresAt = Date.parse(session.accessTokenExpiresAt)
  session.user = user
}

/** Último usuário autenticado (para abrir o app offline com os dados locais). */
async function readCachedUser(): Promise<AuthUser | null> {
  try {
    const raw = await getSecureItem(KEYS.user)
    const user = raw ? normalizeAuthUser(JSON.parse(raw)) : null
    return user
  } catch {
    return null
  }
}

async function clearSession() {
  accessToken = null
  accessExpiresAt = 0
  await Promise.all(Object.values(KEYS).map((key) => deleteSecureItem(key)))
}

/** Encerra a sessão local e avisa o AuthProvider (mantém dados do sync). Usado no 401 UNAUTHENTICATED do upload. */
export async function endSessionKeepData() {
  await clearSession()
  onLoggedOut()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function refreshOnce(refreshToken: string): Promise<string> {
  const { data } = await axios.post<MobileSessionResponse>(
    `${API_URL}/api/v1/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 },
  )
  await saveSession(data)
  return data.accessToken
}

/** Single-flight: todas as chamadas concorrentes esperam o mesmo refresh. */
function refresh(): Promise<string | null> {
  refreshing ??= (async () => {
    const refreshToken = await getSecureItem(KEYS.refresh)
    if (!refreshToken) return null
    try {
      return await refreshOnce(refreshToken)
    } catch (error) {
      const ax = error as AxiosError
      const status = ax.response?.status
      if (status === 401 || status === 400) {
        await clearSession()
        onLoggedOut()
        return null
      }
      if (status === 429) {
        const retryAfter = Number(ax.response?.headers['retry-after']) || 60
        await sleep(Math.min(Math.max(retryAfter, 1), 60) * 1000)
        try {
          return await refreshOnce(refreshToken)
        } catch (retryError) {
          const retryStatus = (retryError as AxiosError).response?.status
          if (retryStatus === 401 || retryStatus === 400) {
            await clearSession()
            onLoggedOut()
          }
          return null
        }
      }
      return null
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

http.interceptors.request.use(async (config) => {
  if (accessToken && accessExpiresAt - Date.now() < 60_000) {
    await refresh()
  }
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  }
  config.headers.set('Content-Type', 'application/json')
  return config
})

http.interceptors.response.use(undefined, async (error: AxiosError<{ error?: string }>) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
  const url = original?.url ?? ''
  const isAuthCall = ['/auth/login', '/auth/refresh', '/auth/logout'].some((path) => url.includes(path))
  if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
    original._retry = true
    const token = await refresh()
    if (token) {
      original.headers.set('Authorization', `Bearer ${token}`)
      return http(original)
    }
  }
  throw toApiError(error)
})

export const authApi = {
  register: (body: RegisterUserRequest) => http.post<UserResponse>('/users', body).then((res) => res.data),

  async login(email: string, password: string): Promise<AuthUser> {
    const { data } = await http.post<MobileSessionResponse>('/auth/login', {
      email,
      password,
      client: 'mobile',
    } satisfies LoginRequest)
    await saveSession(data)
    return data.user
  },

  async restore(): Promise<AuthUser | null> {
    accessToken = await getSecureItem(KEYS.access)
    accessExpiresAt = Date.parse((await getSecureItem(KEYS.accessExp)) ?? '') || 0
    if (!(await getSecureItem(KEYS.refresh))) return null
    try {
      const me = normalizeAuthUser((await http.get<MeResponse>('/auth/me')).data)
      if (!me) return readCachedUser()
      await setSecureItem(KEYS.user, JSON.stringify(me))
      return me
    } catch (error) {
      // Offline-first: sem rede (ou servidor fora), mantém a sessão local com o último usuário.
      // Sessão inválida (401 após refresh) já limpou os tokens e cai no null.
      const apiError = toApiError(error)
      if (apiError.code === 'NETWORK_ERROR' || apiError.status >= 500) {
        if (await getSecureItem(KEYS.refresh)) return readCachedUser()
      }
      return null
    }
  },

  me: () => http.get<MeResponse>('/auth/me').then((res) => res.data),

  async logout(all = false): Promise<void> {
    const refreshToken = await getSecureItem(KEYS.refresh)
    try {
      if (all) await http.post('/auth/logout-all')
      else await http.post('/auth/logout', refreshToken ? { refreshToken } : {})
    } catch {
      // idempotente: limpe localmente mesmo assim
    }
    await clearSession()
  },
}
