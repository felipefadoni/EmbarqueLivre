import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { AppState } from 'react-native'

import { registerBackgroundSync } from './backgroundSync'
import { db, syncLifecycle } from './index'
import { createSyncKicker } from './syncTriggers'

/**
 * Área logada: sincroniza sozinho, sem abrir tela específica.
 * - Rede voltou (Wi‑Fi ou celular) ou app voltou ao primeiro plano → reconecta o PowerSync na hora se estiver
 *   desconectado; conectado, o SDK sobe a fila (fotos → vínculos → finalizar) e baixa as mudanças.
 * - Agenda a tarefa de segundo plano (envio da fila com o app em segundo plano).
 */
export function useSyncTriggers() {
  useEffect(() => {
    const kicker = createSyncKicker({
      getStatus: () => db.currentStatus,
      reconnect: () => syncLifecycle.reconnect(),
      log: (message) => console.log(message),
    })
    const unsubscribeNet = NetInfo.addEventListener((state) => kicker.onNetChange(state))
    const appState = AppState.addEventListener('change', (state) => kicker.onAppState(state))
    registerBackgroundSync().catch((error) => console.warn('[sync] agendar segundo plano:', String((error as Error)?.message ?? error)))
    return () => {
      unsubscribeNet()
      appState.remove()
      kicker.dispose()
    }
  }, [])
}
