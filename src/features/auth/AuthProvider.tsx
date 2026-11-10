import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { authApi, endSessionKeepData, setOnLoggedOut } from '@/api/client'
import type { AuthUser } from '@/api/types'
import { connector, setSyncUser, syncLifecycle } from '@/sync'

type AuthContextValue = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: (all?: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Conecta o PowerSync para o usuário (limpa o banco antes se for outro usuário). */
function startSync(user: AuthUser) {
  setSyncUser({ id: user.id, role: user.role, accountId: user.accountId })
  void syncLifecycle.start(user.id).catch(() => undefined)
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Sessão expirada (refresh recusado): desconecta o sync mas MANTÉM os dados locais e a fila,
    // para não perder alterações offline. Se outro usuário entrar, o start() limpa tudo.
    setOnLoggedOut(() => {
      setSyncUser(null)
      void syncLifecycle.stopKeepData().catch(() => undefined)
      setUser(null)
    })
    connector.onSessionEnded = () => endSessionKeepData()
    authApi
      .restore()
      .then((restored) => {
        if (restored) startSync(restored)
        setUser(restored)
      })
      .finally(() => setIsLoading(false))

    return () => {
      setOnLoggedOut(() => {})
      connector.onSessionEnded = () => {}
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const nextUser = await authApi.login(email, password)
    startSync(nextUser)
    setUser(nextUser)
    return nextUser
  }, [])

  /** Logout explícito: encerra a sessão e apaga o banco local (disconnectAndClear). */
  const logout = useCallback(async (all = false) => {
    await authApi.logout(all)
    setSyncUser(null)
    await syncLifecycle.logoutAndClear().catch(() => undefined)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = use(AuthContext)
  if (!value) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return value
}
