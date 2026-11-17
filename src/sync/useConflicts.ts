import { animalTypesApi, vaccinesApi } from '@/api/catalog'
import { listAllPages } from '@/api/contract'
import { vaccineAccess } from '../features/cadastros/vaccineAccess'
import { connector, currentSyncUser, db } from './index'
import { forcePushConflicts, type ForcePushResult } from './forcePush'
import { newUlid } from './ids'
import { applyIdMap, guardLocalRows, loadIdMap } from './localGuard'
import { SYNC_TABLES } from './mapping'
import { animalAccountQuery } from './queries'
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
  if (table === 'vaccines') {
    // §25.3: master/básico recebem só a própria conta; admin, todas (cada item com accountId).
    const items = await listAllPages(vaccinesApi.list)
    return items.map((item) => ({ id: item.id, name: item.name, accountId: item.accountId ?? null }))
  }
  const items = await listAllPages(animalTypesApi.list)
  return items.map((item) => ({ id: item.id, name: item.name }))
}

/** Conta do catálogo de vacinas para o cadastro em conflito: a do animal da vacinação; sem animal, a do usuário. */
async function catalogAccountFor(_table: 'animal_types' | 'vaccines', opData: Record<string, unknown>): Promise<string | null> {
  const animalId = typeof opData.animal_id === 'string' ? opData.animal_id : ''
  if (animalId) {
    const query = animalAccountQuery(animalId)
    const row = await db.getOptional<{ accountId: string | null }>(query.sql, query.params as unknown[]).catch(() => null)
    if (row?.accountId) return row.accountId
  }
  return currentSyncUser()?.accountId ?? null
}

function canCreateCatalog(table: 'animal_types' | 'vaccines'): boolean {
  // Tipos de animal: comportamento de antes (tenta; o servidor responde 403 se não for admin).
  return table === 'vaccines' ? vaccineAccess(currentSyncUser()?.role).canCreate : true
}

function rememberCatalogLink(table: 'animal_types' | 'vaccines'): boolean {
  // Admin lança em várias contas: cada uma tem a sua cópia da vacina, então nada de de-para global.
  return !(table === 'vaccines' && currentSyncUser()?.role === 'admin')
}

/**
 * Envio forçado (local → API) dos conflitos escolhidos — SÓ depois da confirmação na tela. Ver forcePush.ts.
 */
export async function forcePush(ids?: string[]): Promise<ForcePushResult[]> {
  const results = await forcePushConflicts(
    db,
    { ...connector.uploadDeps(db), fetchCatalog, catalogAccountFor, canCreateCatalog, rememberCatalogLink, newId: newUlid },
    ids,
  )
  void runLocalGuard()
  void uploadPump.tick().catch(() => undefined)
  return results
}
