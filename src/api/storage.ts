import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

/**
 * Tokens ficam no expo-secure-store (Keychain/Keystore) no nativo.
 * No web o SecureStore não está disponível: usamos localStorage, como no
 * guia oficial de autenticação do Expo Router. Nunca usar AsyncStorage.
 */
export async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage.getItem(key)
    } catch {
      return null
    }
  }
  return SecureStore.getItemAsync(key)
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage.removeItem(key)
    } catch {
      // ignora storage indisponível
    }
    return
  }
  await SecureStore.deleteItemAsync(key)
}
