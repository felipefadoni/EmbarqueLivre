/**
 * Ciclo de vida da sincronização, chamado pelo AuthProvider.
 * - Login/restauração: conecta. Se o usuário mudou desde a última sessão, limpa o banco local antes.
 * - Logout explícito: disconnectAndClear (dados e pendências locais são apagados).
 * - Sessão expirada (logout forçado pelo refresh): só desconecta e mantém os dados, para não perder
 *   alterações offline; se outro usuário entrar depois, o start() limpa.
 * Puro: recebe o banco e o storage por injeção (testável no Node).
 */
export type LifecycleDb = {
  connect: (...args: any[]) => Promise<void>
  disconnect: () => Promise<void>
  disconnectAndClear: (options?: { clearLocal?: boolean }) => Promise<void>
}

export type KeyValueStorage = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  remove: (key: string) => Promise<void>
}

export const SYNC_USER_KEY = 'el.syncUserId'

export function createSyncLifecycle(deps: {
  db: LifecycleDb
  storage: KeyValueStorage
  connect: () => Promise<void>
}) {
  let current: string | null = null
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>) => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => undefined)
    return next
  }

  return {
    start(userId: string) {
      return serial(async () => {
        if (current === userId) return
        const previous = await deps.storage.get(SYNC_USER_KEY)
        if (previous && previous !== userId) {
          await deps.db.disconnectAndClear({ clearLocal: true })
        }
        await deps.storage.set(SYNC_USER_KEY, userId)
        current = userId
        await deps.connect()
      })
    },
    logoutAndClear() {
      return serial(async () => {
        current = null
        await deps.db.disconnectAndClear({ clearLocal: true })
        await deps.storage.remove(SYNC_USER_KEY)
      })
    },
    /**
     * Rede voltou / app voltou ao primeiro plano: reconecta já (sobe a fila e baixa mudanças) se houver sessão.
     * Sem sessão não faz nada.
     */
    reconnect() {
      return serial(async () => {
        if (!current) return false
        await deps.connect()
        return true
      })
    },
        stopKeepData() {
      return serial(async () => {
        current = null
        await deps.db.disconnect()
      })
    },
  }
}
