import type { PowerSyncDatabase } from '@powersync/react-native'

import { POWERSYNC_CONFIG } from './config'
import { nativeDbStatus, type NativeDbStatus } from './native'
import { createSyncLogger } from './logger'
import { AppSchema } from './schema'

let instance: PowerSyncDatabase | null = null
let status: NativeDbStatus | null = null

/**
 * Cria o banco na primeira chamada. `@powersync/react-native` (que importa o op-sqlite) só é
 * carregado AQUI, via require, depois de confirmar que o módulo nativo existe — importar este
 * arquivo não avalia o op-sqlite.
 */
export function initDatabase(): NativeDbStatus {
  if (status) return status
  const native = nativeDbStatus()
  if (!native.available) return (status = native)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PowerSyncDatabase: Database } = require('@powersync/react-native') as typeof import('@powersync/react-native')
    // Instância única (um arquivo = uma instância). Adaptador OP-SQLite embutido no SDK v2.
    instance = new Database({
      schema: AppSchema,
      database: { dbFilename: POWERSYNC_CONFIG.dbFilename },
      logger: createSyncLogger(),
    })
    status = { available: true }
  } catch (error) {
    status = { available: false, reason: 'init-failed', detail: String((error as Error)?.message ?? error) }
  }
  return status
}

export function getDb(): PowerSyncDatabase {
  if (!instance) {
    const result = initDatabase()
    if (!instance) throw new Error(`Banco local indisponível (${result.available ? 'desconhecido' : result.reason}).`)
  }
  return instance
}

/**
 * Acesso preguiçoso: `db.getAll(...)` etc. criam o banco no primeiro uso.
 * O app só chega a usar o `db` depois que o SyncProvider confirmou que o banco abriu.
 */
export const db = new Proxy({} as PowerSyncDatabase, {
  get(_target, property) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>
    const value = real[property]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value
  },
})
