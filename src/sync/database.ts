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
      // DEBUG-TEMP (remover): mede quando o fetch do stream resolve e o que volta
      remote: {
        fetchImplementation: {
          supportsStreams: true,
          async run({ resource, request }: { resource: string; request: RequestInit }) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { fetch: expoFetch } = require('expo/fetch')
            const t0 = Date.now()
            const path = String(resource).replace(/^https?:\/\/[^/]+/, '')
            const hdr = (request.headers ?? {}) as Record<string, string>
            console.log(`[DEBUG-TEMP] fetch start ${request.method} ${path} accept=${hdr.accept ?? hdr.Accept ?? '-'} acceptEnc=${hdr['Accept-Encoding'] ?? hdr['accept-encoding'] ?? '(default)'}`)
            if (path.startsWith('/sync/stream')) {
              const probe = String(resource).replace(/\/sync\/stream.*$/, '/probes/liveness')
              setTimeout(() => {
                const a = Date.now()
                expoFetch(probe).then((r: Response) => console.log(`[DEBUG-TEMP] probe expo/fetch ${r.status} ${Date.now() - a}ms`), (e: unknown) => console.log(`[DEBUG-TEMP] probe expo/fetch erro ${String(e)}`))
                const b = Date.now()
                fetch(probe).then((r) => console.log(`[DEBUG-TEMP] probe RN fetch ${r.status} ${Date.now() - b}ms`), (e) => console.log(`[DEBUG-TEMP] probe RN fetch erro ${String(e)}`))
              }, 3000)
            }
            const tick = setInterval(() => console.log(`[DEBUG-TEMP] ${path} ainda sem resposta ${Date.now() - t0}ms`), 5000)
            try {
              const res = await expoFetch(resource, request)
              console.log(`[DEBUG-TEMP] fetch resolved ${path} ${Date.now() - t0}ms status=${res.status} ce=${res.headers.get('content-encoding')} ct=${res.headers.get('content-type')}`)
              return res
            } catch (e) {
              console.log(`[DEBUG-TEMP] fetch error ${path} ${Date.now() - t0}ms ${String((e as Error)?.message ?? e)}`)
              throw e
            } finally {
              clearInterval(tick)
            }
          },
        },
      },
    } as any)
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
