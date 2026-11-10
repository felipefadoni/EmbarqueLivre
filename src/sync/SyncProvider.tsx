import { PowerSyncContext } from '@powersync/react'
import { useState, type ReactNode } from 'react'

import { NativeDbMissingScreen } from '@/components/sync/NativeDbMissingScreen'
import { getDb, initDatabase } from './database'

/**
 * Abre o banco local e o disponibiliza para useQuery/useStatus/usePowerSync.
 * Sem o módulo nativo (Expo Go, web ou dev build antigo) mostra uma tela explicativa em vez de quebrar.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [status] = useState(initDatabase)
  if (!status.available) return <NativeDbMissingScreen reason={status.reason} detail={status.detail} />
  return <PowerSyncContext.Provider value={getDb()}>{children}</PowerSyncContext.Provider>
}
