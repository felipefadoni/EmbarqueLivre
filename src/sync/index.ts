import type { UserRole } from '@/api/types'
import { deleteSecureItem, getSecureItem, setSecureItem } from '@/api/storage'
import { todayIso } from '@/components/form/date'

import { POWERSYNC_CONFIG } from './config'
import { EmbarqueConnector } from './connector'
import { db } from './database'
import { newUlid } from './ids'
import { createSyncLifecycle } from './lifecycle'
import { createRepository } from './repository'

let syncUser: { id: string; role: UserRole; accountId?: string | null } | null = null

/** Usuário atual para as escritas locais (created_by, conta da fazenda). */
export function setSyncUser(user: { id: string; role: UserRole; accountId?: string | null } | null) {
  syncUser = user
}

export const connector = new EmbarqueConnector()

export const repo = createRepository({
  db,
  newId: newUlid,
  now: () => new Date().toISOString(),
  today: todayIso,
  currentUser: () => syncUser,
})

export const syncLifecycle = createSyncLifecycle({
  db,
  storage: { get: getSecureItem, set: setSecureItem, remove: deleteSecureItem },
  connect: async () => {
    connector.invalidate()
    await db.connect(connector, { checkpointMode: POWERSYNC_CONFIG.checkpointMode, retryDelayMs: POWERSYNC_CONFIG.retryDelayMs })
  },
})

export { db }
