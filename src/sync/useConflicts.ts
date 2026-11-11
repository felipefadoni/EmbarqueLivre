import { animalTypesApi, vaccinesApi } from '@/api/catalog'
import { listAllPages } from '@/api/contract'
import { connector, db } from './index'
import { forcePushConflicts, type ForcePushResult } from './forcePush'
import { newUlid } from './ids'
import { applyIdMap, guardLocalRows, loadIdMap } from './localGuard'
import { SYNC_TABLES } from './mapping'
import { retryDueConflicts } from './outbox'
import { uploadPump } from './useUploadPump'

const GUARDED_TABLES = Object.values(SYNC_TABLES).map((def) => def.table)

let guardRunning: Promise<unknown> | null = null
let guardAgain = false

/** Protege as linhas guardadas (conflitos e enviados sem confirmação) depois de qualquer mudança/checkpoint. */
export function runLocalGuard(): Promise<unknown> {
  if (guardRunning) {
    guardAgain = true
    return guardRunning
  }
  const lastSynced = db.currentStatus.lastSyncedAt?.getTime() ?? null
  guardRunning = guardLocalRows(db, lastSynced)
    .catch((error) => console.warn('[sync] proteção do cadastro local:', String((error as Error)?.message ?? error)))
    .finally(() => {
      guardRunning = null
      if (guardAgain) {
        guardAgain = false
        void runLocalGuard()
      }
    })
  return guardRunning
}

/**
 * Liga a proteção: a cada checkpoint aplicado (lastSyncedAt mudou) e a cada mudança nas tabelas sincronizadas,
 * restaura o que o download apagou/trocou de cadastro local não confirmado. Devolve a função para desligar.
 */
export function startLocalGuard(): () => void {
  let lastSynced = db.currentStatus.lastSyncedAt?.getTime() ?? null
  const offStatus = db.registerListener({
    statusChanged: (status) => {
      const next = status.lastSyncedAt?.getTime() ?? null
      if (next !== lastSynced) {
        lastSynced = next
        void runLocalGuard()
      }
    },
  })
  const offChange = db.onChange({ onChange: () => void runLocalGuard() }, { tables: GUARDED_TABLES, throttleMs: 300 })
  void runLocalGuard()
  return () => {
    offStatus()
    offChange()
  }
}

/** Conflitos com espera vencida: reenvia o MESMO dado (sem forçar), sem travar nada. */
export async function retryConflictsSoon(): Promise<number> {
  const map = await loadIdMap(db).catch(() => new Map<string, string>())
  return retryDueConflicts(db, { ...connector.uploadDeps(db), mapOp: (op) => applyIdMap(op, map) }).catch(() => 0)
}

async function fetchCatalog(table: 'animal_types' | 'vaccines') {
  const items = await listAllPages(table === 'animal_types' ? animalTypesApi.list : vaccinesApi.list)
  return items.map((item) => ({ id: item.id, name: item.name }))
}

/**
 * Envio forçado (local → API) dos conflitos escolhidos — SÓ depois da confirmação na tela. Ver forcePush.ts.
 */
export async function forcePush(ids?: string[]): Promise<ForcePushResult[]> {
  const results = await forcePushConflicts(db, { ...connector.uploadDeps(db), fetchCatalog, newId: newUlid }, ids)
  void runLocalGuard()
  void uploadPump.tick().catch(() => undefined)
  return results
}
