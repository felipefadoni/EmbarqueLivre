/**
 * Ponto de entrada. A tarefa de segundo plano (TaskManager) precisa ser definida no escopo global do bundle, antes
 * de o app montar — inclusive quando o SO acorda o app só para ela (sem UI). Depois, o expo-router assume.
 */
import { defineBackgroundSyncTask } from './src/sync/backgroundSync'

defineBackgroundSyncTask()

// eslint-disable-next-line import/first
import 'expo-router/entry'
