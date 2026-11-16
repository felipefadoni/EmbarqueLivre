import { Image } from 'expo-image'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'

import { accountApi } from '@/api/account'
import { authApi, endSessionKeepData, forgetSession, setOnLoggedOut } from '@/api/client'
import type { AuthUser } from '@/api/types'
import {
  DELETION_MESSAGES,
  runPostDeletionCleanup,
  type DeletionResult,
  type DeletionScope,
} from '@/features/account/accountDeletion'
import { deleteAllLocalShipmentFiles } from '@/features/embarques/photoCapture'
import { connector, setSyncUser, syncLifecycle } from '@/sync'
import { unregisterBackgroundSync } from '@/sync/backgroundSync'

type AuthContextValue = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  /** Aviso para a tela de login (ex.: "Conta excluída"). Some no próximo login. */
  notice: string | null
  login: (email: string, password: string) => Promise<AuthUser>
  logout: (all?: boolean) => Promise<void>
  /**
   * POST /auth/me/deletion. No 200 (deleted ou already_deleted) chama onDeleted e faz a limpeza total do aparelho
   * antes de voltar ao login. Erros da API sobem como ApiError (nada é limpo).
   */
  deleteAccount: (
    input: { password: string; scope: DeletionScope },
    onDeleted?: (result: DeletionResult) => void,
  ) => Promise<DeletionResult>
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
  const [notice, setNotice] = useState<string | null>(null)
  // Exclusão em andamento: um 401 do sync nesse meio-tempo NÃO pode fazer o logout "mantendo dados";
  // o fluxo de exclusão decide (limpa tudo no sucesso ou reaplica o logout pendente na falha).
  const deletingRef = useRef(false)
  const missedLogoutRef = useRef(false)
  const missedLogoutHandler = useRef<() => void>(() => {})

  useEffect(() => {
    // Sessão expirada (refresh recusado): desconecta o sync mas MANTÉM os dados locais e a fila,
    // para não perder alterações offline. Se outro usuário entrar, o start() limpa tudo.
    const onSessionExpired = () => {
      setSyncUser(null)
      void syncLifecycle.stopKeepData().catch(() => undefined)
      setUser(null)
    }
    setOnLoggedOut(() => {
      if (deletingRef.current) {
        missedLogoutRef.current = true
        return
      }
      onSessionExpired()
    })
    missedLogoutHandler.current = onSessionExpired
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
    setNotice(null)
    startSync(nextUser)
    setUser(nextUser)
    return nextUser
  }, [])

  /** Logout explícito: encerra a sessão e apaga o banco local (disconnectAndClear). */
  const logout = useCallback(async (all = false) => {
    await authApi.logout(all)
    setSyncUser(null)
    await syncLifecycle.logoutAndClear().catch(() => undefined)
    // Sem sessão não há o que enviar em segundo plano.
    await unregisterBackgroundSync().catch(() => undefined)
    setUser(null)
  }, [])

  const deleteAccount = useCallback<AuthContextValue['deleteAccount']>(async (input, onDeleted) => {
    deletingRef.current = true
    missedLogoutRef.current = false
    let result: DeletionResult
    try {
      result = await accountApi.deleteMe(input)
    } catch (error) {
      deletingRef.current = false
      // Conta não foi excluída, mas a sessão caiu no meio (ex.: removido por um master): aplica o logout normal.
      if (missedLogoutRef.current) missedLogoutHandler.current()
      throw error
    }
    onDeleted?.(result)
    // Mesma rotina do "Sair", mas sem POST /auth/logout (sessões já revogadas) e apagando tudo do aparelho.
    await runPostDeletionCleanup({
      forgetSession,
      clearSyncUser: () => setSyncUser(null),
      disconnectAndClear: () => syncLifecycle.logoutAndClear(),
      unregisterBackgroundSync,
      deleteLocalFiles: async () => {
        deleteAllLocalShipmentFiles()
        await Promise.allSettled([Image.clearDiskCache(), Image.clearMemoryCache()])
      },
      resetMemory: () => connector.invalidate(),
      signOut: () => {
        deletingRef.current = false
        missedLogoutRef.current = false
        setNotice(DELETION_MESSAGES.deleted)
        setUser(null)
      },
    })
    return result
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      notice,
      login,
      logout,
      deleteAccount,
    }),
    [user, isLoading, notice, login, logout, deleteAccount],
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
