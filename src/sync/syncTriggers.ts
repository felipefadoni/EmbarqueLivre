/**
 * Gatilhos de sincronização automática (puro, testável no Node).
 * - Rede voltou (qualquer tipo: Wi‑Fi, 3G/4G/5G, Ethernet — não filtra por tipo) ou app voltou ao primeiro plano:
 *   se o PowerSync não está conectado, reconecta na hora (em vez de esperar o próximo retry do SDK). Ao conectar,
 *   o SDK sobe a fila (fotos → vínculos → finalizar, pelo connector) e baixa as mudanças.
 * - Sem loop: debounce curto e intervalo mínimo entre reconexões forçadas; se já está conectado, não faz nada.
 */
export type NetStateLike = { isConnected: boolean | null; isInternetReachable?: boolean | null; type?: string | null }
export type SyncStatusLike = { connected: boolean; connecting?: boolean }

/** Tem rede utilizável? `isInternetReachable` null (ainda não testado) conta como sim. Tipo de rede é irrelevante. */
export function isOnline(state: NetStateLike | null | undefined): boolean {
  return Boolean(state) && state!.isConnected === true && state!.isInternetReachable !== false
}

export type SyncKickerDeps = {
  getStatus: () => SyncStatusLike | null
  reconnect: () => Promise<unknown>
  now?: () => number
  /** Espera a rede estabilizar (a troca Wi‑Fi ↔ celular gera vários eventos). */
  debounceMs?: number
  /** Intervalo mínimo entre reconexões forçadas (o SDK já tem o próprio retry). */
  minIntervalMs?: number
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
  log?: (message: string) => void
}

export type KickOutcome = 'connected' | 'throttled' | 'reconnected' | 'failed' | 'unavailable'

export function createSyncKicker(deps: SyncKickerDeps) {
  const now = deps.now ?? Date.now
  const debounceMs = deps.debounceMs ?? 1_500
  const minIntervalMs = deps.minIntervalMs ?? 10_000
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let timer: unknown = null
  let lastReconnect = -Infinity
  let wasOnline: boolean | null = null
  let disposed = false

  async function run(reason: string): Promise<KickOutcome> {
    let status: SyncStatusLike | null
    try {
      status = deps.getStatus()
    } catch {
      return 'unavailable'
    }
    if (!status) return 'unavailable'
    if (status.connected) return 'connected'
    if (now() - lastReconnect < minIntervalMs) return 'throttled'
    lastReconnect = now()
    deps.log?.(`[sync] reconectando (${reason})`)
    try {
      await deps.reconnect()
      return 'reconnected'
    } catch {
      return 'failed'
    }
  }

  function kick(reason: string) {
    if (disposed) return
    if (timer != null) cancel(timer)
    timer = schedule(() => {
      timer = null
      if (!disposed) void run(reason)
    }, debounceMs)
  }

  return {
    kick,
    /** Para teste: roda já, sem debounce. */
    runNow: run,
    /** Evento do NetInfo: dispara quando passa de sem rede → com rede (e no primeiro estado, se já online). */
    onNetChange(state: NetStateLike) {
      const online = isOnline(state)
      const previous = wasOnline
      wasOnline = online
      if (online && previous !== true) kick(previous === null ? 'abertura' : `rede voltou (${state.type ?? 'desconhecida'})`)
    },
    /** App voltou ao primeiro plano: retoma o que ficou pendente. */
    onAppState(state: string) {
      if (state === 'active' && wasOnline !== false) kick('app em primeiro plano')
    },
    dispose() {
      disposed = true
      if (timer != null) cancel(timer)
      timer = null
    },
  }
}
