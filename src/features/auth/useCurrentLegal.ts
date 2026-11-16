import { useCallback, useEffect, useState } from 'react'

import { isApiError } from '@/api/errors'
import { fetchCurrentLegal } from '@/api/legal'
import { useIsOnline } from '@/sync/hooks'

import { legalLoadErrorMessage, type LegalLoadState } from './legalConsent'

/**
 * Termos/Política vigentes para o cadastro. Busca ao abrir a tela, em `reload` ("Tentar novamente" ou versão
 * desatualizada) e sozinho quando a internet volta depois de uma falha.
 */
export function useCurrentLegal() {
  const [state, setState] = useState<LegalLoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const online = useIsOnline()
  const retryOnReconnect = online && state.status === 'error'
  const shouldFetch = state.status === 'loading' || retryOnReconnect

  useEffect(() => {
    if (!shouldFetch) return
    let active = true
    fetchCurrentLegal().then(
      (legal) => {
        if (active) setState({ status: 'ready', legal })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: legalLoadErrorMessage(isApiError(error) ? error : null) })
      },
    )
    return () => {
      active = false
    }
  }, [shouldFetch, attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { state, reload }
}
