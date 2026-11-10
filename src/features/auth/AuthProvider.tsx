import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { authApi, setOnLoggedOut } from '@/api/client'
import type { AuthUser } from '@/api/types'

type AuthContextValue = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: (all?: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setOnLoggedOut(() => setUser(null))
    authApi
      .restore()
      .then((restored) => setUser(restored))
      .finally(() => setIsLoading(false))

    return () => setOnLoggedOut(() => {})
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const nextUser = await authApi.login(email, password)
    setUser(nextUser)
    return nextUser
  }, [])

  const logout = useCallback(async (all = false) => {
    await authApi.logout(all)
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
