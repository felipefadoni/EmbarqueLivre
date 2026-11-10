import Constants, { ExecutionEnvironment } from 'expo-constants'
import { NativeModules, Platform } from 'react-native'

export type NativeDbStatus =
  | { available: true }
  | { available: false; reason: 'expo-go' | 'web' | 'missing-native-module' | 'init-failed'; detail?: string }

/**
 * O banco local (PowerSync + OP-SQLite) é nativo. No Expo Go, na web ou num dev build antigo (feito antes
 * de instalar o op-sqlite) o módulo não existe e o op-sqlite LANÇA ERRO ao ser importado.
 * Esta checagem roda ANTES de qualquer require de `@powersync/react-native` / `@op-engineering/op-sqlite`
 * e repete a condição do próprio op-sqlite (src/functions.ts).
 */
export function nativeDbStatus(): NativeDbStatus {
  if (Platform.OS === 'web') return { available: false, reason: 'web' }
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return { available: false, reason: 'expo-go' }
  const g = globalThis as { __OPSQLiteProxy?: unknown }
  if (g.__OPSQLiteProxy == null && NativeModules.OPSQLite == null) return { available: false, reason: 'missing-native-module' }
  return { available: true }
}
