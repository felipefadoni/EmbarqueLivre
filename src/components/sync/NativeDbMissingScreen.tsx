import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { Platform, ScrollView, Text as NativeText, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, YStack } from 'tamagui'

import type { NativeDbStatus } from '@/sync/native'

type Reason = Exclude<NativeDbStatus, { available: true }>['reason']

const TITLE: Record<Reason, string> = {
  'expo-go': 'Este app precisa de um development build',
  web: 'Versão web não suportada',
  'missing-native-module': 'Este build está desatualizado',
  'init-failed': 'Não foi possível abrir o banco local',
}

const MESSAGE: Record<Reason, string> = {
  'expo-go':
    'Este app precisa de um development build. O Expo Go não suporta o banco local (PowerSync/OP-SQLite) usado para funcionar offline.',
  web: 'O Embarque Livre usa um banco local nativo para funcionar offline. Use o app no iPhone ou no Android.',
  'missing-native-module':
    'O app instalado foi gerado antes do banco local (OP-SQLite) ser adicionado. Gere e instale um novo development build.',
  'init-failed': 'O módulo nativo do banco local não iniciou. Gere um novo development build e veja os logs nativos.',
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })

const COMMANDS = [
  'npx expo prebuild --clean',
  'npx expo run:ios        # ou: npx expo run:android',
  'npx expo start --dev-client',
]

/** Tela cheia quando o banco local nativo não existe (em vez do erro "Base module not found"). */
export function NativeDbMissingScreen({ reason, detail }: { reason: Reason; detail?: string }) {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined)
  }, [])
  return (
    <YStack flex={1} bg="appBg">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, paddingHorizontal: 24, gap: 16 }}>
        <Text fontSize={26} fontWeight="800" color="brandFg" accessibilityRole="header">
          {TITLE[reason]}
        </Text>
        <Text fontSize={18} lineHeight="26px" fontWeight="600" color="brandFg">
          {MESSAGE[reason]}
        </Text>
        {reason === 'web' ? null : (
          <YStack gap={8}>
            <Text fontSize={16} fontWeight="800" color="brandMuted">
              No computador, na pasta do projeto:
            </Text>
            <YStack bg="brandSurface" borderColor="brandBorder" borderWidth={2} rounded={14} p={14} gap={6}>
              {COMMANDS.map((command) => (
                <NativeText key={command} selectable style={{ fontFamily: MONO, fontSize: 14, color: isDark ? '#D1EFEF' : '#2B3D34' }}>
                  {command}
                </NativeText>
              ))}
            </YStack>
            <Text fontSize={16} lineHeight="22px" fontWeight="600" color="brandMuted">
              Depois abra o app “embarquelivre” instalado no simulador/aparelho (não o Expo Go). Detalhes em docs/POWERSYNC.md.
            </Text>
          </YStack>
        )}
        {detail ? (
          <NativeText selectable style={{ fontSize: 13, color: isDark ? '#A8B8AF' : '#5B6B62' }}>
            Detalhe técnico: {detail}
          </NativeText>
        ) : null}
      </ScrollView>
    </YStack>
  )
}
