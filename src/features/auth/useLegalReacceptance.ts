import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import { fetchLegalStatus } from '@/api/legal'
import { useIsOnline } from '@/sync/hooks'

import { useAuth } from './AuthProvider'
import { isReacceptanceGateVisible, isReacceptancePending, shouldCheckLegalStatus, type LegalStatus } from './legalReacceptance'

/**
 * Estado do re-aceite (Termos/Política) do usuário logado. Consulta GET /legal/status ao abrir a área logada, quando a
 * internet volta e quando o app volta ao primeiro plano (com intervalo mínimo). Sem internet não bloqueia (ver
 * legalReacceptance.ts). Não toca em sync, fila nem dados locais.
 */
export function useLegalReacceptance() {
  const { user, isAuthenticated } = useAuth()
  const online = useIsOnline()
  const [status, setStatus] = useState<LegalStatus | null>(null)
  const [lastCheck, setLastCheck] = useState<{ at: number | null; failed: boolean }>({ at: null, failed: false })
  const [wake, setWake] = useState(0)
  const inFlight = useRef(false)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setWake((n) => n + 1)
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    const check = shouldCheckLegalStatus({
      authenticated: isAuthenticated,
      online,
      inFlight: inFlight.current,
      lastCheckedAt: lastCheck.at,
      lastFailed: lastCheck.failed,
      now: Date.now(),
    })
    if (!check) return
    let active = true
    inFlight.current = true
    fetchLegalStatus()
      .then(
        (next) => {
          if (!active) return
          setStatus(next)
          setLastCheck({ at: Date.now(), failed: false })
        },
        () => {
          // Falha (rede, 5xx, resposta estranha): mantém o último estado conhecido e tenta de novo depois.
          if (active) setLastCheck({ at: Date.now(), failed: true })
        },
      )
      .finally(() => {
        inFlight.current = false
      })
    return () => {
      active = false
      inFlight.current = false
    }
  }, [isAuthenticated, online, wake, lastCheck])

  /** Recarrega já (mismatch de versão no aceite). */
  const reload = useCallback(() => setLastCheck({ at: null, failed: false }), [])

  /** Aceite registrado: usa o `legal` devolvido pelo POST (sem nova consulta). */
  const applyStatus = useCallback((next: LegalStatus) => {
    setStatus(next)
    setLastCheck({ at: Date.now(), failed: false })
  }, [])

  const pending = isReacceptancePending(status, user?.role)
  return {
    status,
    pending,
    gateVisible: isReacceptanceGateVisible({ pending, online }),
    reload,
    applyStatus,
  }
}
