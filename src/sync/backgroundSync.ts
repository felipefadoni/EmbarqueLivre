/**
 * Sincronização em segundo plano (expo-background-task: BGTaskScheduler no iOS, WorkManager no Android).
 * O SO decide quando roda (mínimo pedido: 15 min, com rede; no iOS pode demorar bem mais). A tarefa:
 * sessão salva? → rede? → abre o banco → envia a fila do PowerSync pelo connector (foto → vínculo → finalizar)
 * dentro de ~25 s. Não baixa dados (isso é feito ao abrir o app). Falha temporária = o SO tenta noutra janela.
 *
 * A tarefa é definida no ponto de entrada (`index.ts`, antes do expo-router), como o TaskManager exige.
 * Módulos nativos carregados sob demanda: um build antigo sem eles não quebra (só não agenda).
 */
import NetInfo from '@react-native-community/netinfo'

import { loadStoredSession } from '@/api/client'
import { drainUploadQueue } from './backgroundDrain'
import { initDatabase, getDb } from './database'
import { connector } from './index'
import { nextUploadKey } from './outbox'
import { isOnline } from './syncTriggers'

export const BACKGROUND_SYNC_TASK = 'embarquelivre-background-sync'
/** Intervalo mínimo pedido ao SO, em minutos (o Android não aceita menos que 15; o iOS trata como sugestão). */
export const BACKGROUND_SYNC_MINUTES = 15
/** Janela de envio: o iOS dá ~30 s por execução; para com folga. */
const BACKGROUND_BUDGET_MS = 25_000

type TaskManagerModule = typeof import('expo-task-manager')
type BackgroundTaskModule = typeof import('expo-background-task')

function loadModules(): { TaskManager: TaskManagerModule; BackgroundTask: BackgroundTaskModule } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require('expo-task-manager') as TaskManagerModule
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BackgroundTask = require('expo-background-task') as BackgroundTaskModule
    return { TaskManager, BackgroundTask }
  } catch {
    return null
  }
}

/** Uma execução: devolve true = sucesso (ou nada a fazer); false = falha temporária (o SO tenta de novo depois). */
export async function runBackgroundSync(): Promise<boolean> {
  if (!(await loadStoredSession())) return true
  const net = await NetInfo.fetch().catch(() => null)
  if (!isOnline(net)) return true
  if (!initDatabase().available) return false
  const modules = loadModules()
  let expired = false
  const subscription = modules?.BackgroundTask.addExpirationListener(() => {
    expired = true
  })
  try {
    const database = getDb()
    const result = await drainUploadQueue({
      // Saída de reenvio primeiro, depois a fila do PowerSync (mesma ordem do primeiro plano).
      nextTransactionId: () => nextUploadKey(database),
      upload: () => connector.uploadData(database),
      now: Date.now,
      deadline: Date.now() + BACKGROUND_BUDGET_MS,
      shouldStop: () => expired,
    })
    if (result.status !== 'empty') console.log(`[sync] segundo plano: ${result.status}, ${result.uploaded} transação(ões) enviada(s)`)
    return result.status !== 'retry'
  } catch (error) {
    console.warn('[sync] segundo plano:', String((error as Error)?.message ?? error))
    return false
  } finally {
    subscription?.remove()
  }
}

/** Define a tarefa (escopo global do bundle, chamado em `index.ts`). */
export function defineBackgroundSyncTask() {
  const modules = loadModules()
  if (!modules || modules.TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) return
  modules.TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    const ok = await runBackgroundSync()
    return ok ? modules.BackgroundTask.BackgroundTaskResult.Success : modules.BackgroundTask.BackgroundTaskResult.Failed
  })
}

/** Agenda a tarefa periódica (idempotente). Chamado na área logada. */
export async function registerBackgroundSync(): Promise<boolean> {
  const modules = loadModules()
  if (!modules) return false
  const status = await modules.BackgroundTask.getStatusAsync()
  if (status !== modules.BackgroundTask.BackgroundTaskStatus.Available) return false
  if (await modules.TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) return true
  await modules.BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: BACKGROUND_SYNC_MINUTES })
  return true
}

/** Cancela o agendamento (logout explícito). */
export async function unregisterBackgroundSync(): Promise<void> {
  const modules = loadModules()
  if (!modules) return
  if (await modules.TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
    await modules.BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK)
  }
}
