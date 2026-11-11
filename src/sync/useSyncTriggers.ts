import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { AppState } from 'react-native'

import { registerBackgroundSync } from './backgroundSync'
import { db, syncLifecycle } from './index'
import { createSyncKicker, isOnline } from './syncTriggers'
import { newUlid } from './ids'
import { requeueDeliveryFailures } from './outbox'
import { retryConflictsSoon, startLocalGuard } from './useConflicts'
import { uploadPump } from './useUploadPump'

/** Verificação periódica da fila (consulta local barata; só envia se o SDK não estiver enviando). */
const PUMP_TICK_MS = 15_000

/**
 * Área logada: sincroniza sozinho, sem abrir tela específica.
 * - Rede voltou (Wi‑Fi ou celular) ou app voltou ao primeiro plano → reconecta o PowerSync na hora se estiver
 *   desconectado; conectado, o SDK sobe a fila (fotos → vínculos → finalizar) e baixa as mudanças.
 * - Envio direto para a API (uploadPump) quando o SDK não está conectado ao serviço PowerSync: sem isso a fila
 *   ficava parada (e muda) com o PowerSync fora do ar mesmo com a API respondendo.
 * - Agenda a tarefa de segundo plano (envio da fila com o app em segundo plano).
 */
export function useSyncTriggers() {
  useEffect(() => {
    const kicker = createSyncKicker({
      getStatus: () => db.currentStatus,
      reconnect: () => syncLifecycle.reconnect(),
      log: (message) => console.log(message),
    })
    const tick = () => void uploadPump.tick().catch(() => undefined)
    let soon: ReturnType<typeof setTimeout> | null = null
    // Dá tempo ao reconnect (debounce 1,5 s) antes de decidir se o envio direto é necessário.
    const tickSoon = () => {
      if (soon) clearTimeout(soon)
      uploadPump.resetBackoff()
      soon = setTimeout(() => {
        tick()
        void retryConflictsSoon()
      }, 4_000)
    }
    // Cadastro local não confirmado nunca some nem é trocado pelo download (ver localGuard.ts).
    const stopGuard = startLocalGuard()
    let wasOnline: boolean | null = null
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      kicker.onNetChange(state)
      const online = isOnline(state)
      // Só na passagem sem rede → com rede (e no primeiro estado): o NetInfo emite vários eventos iguais.
      if (online && wasOnline !== true) tickSoon()
      wasOnline = online
    })
    const appState = AppState.addEventListener('change', (state) => {
      kicker.onAppState(state)
      if (state === 'active') tickSoon()
    })
    // Ao abrir: o que versões anteriores marcaram como Pendência por falha de envio volta para o envio automático.
    void requeueDeliveryFailures(db, newUlid)
      .then((moved) => (moved ? tickSoon() : undefined))
      .catch((error) => console.warn('[sync] devolver ao envio:', String((error as Error)?.message ?? error)))
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') tick()
    }, PUMP_TICK_MS)
    registerBackgroundSync().catch((error) => console.warn('[sync] agendar segundo plano:', String((error as Error)?.message ?? error)))
    return () => {
      unsubscribeNet()
      appState.remove()
      clearInterval(interval)
      if (soon) clearTimeout(soon)
      stopGuard()
      kicker.dispose()
    }
  }, [])
}
