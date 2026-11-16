import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { Pressable, ScrollView, Text as NativeText, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, YStack } from 'tamagui'

import type { EnvProblem } from '@/config/env'

type Props = {
  title: string
  message: string
  /** Só nomes de env (nunca valores). */
  envProblems?: EnvProblem[]
  detail?: string
  onRetry?: () => void
}

/** Tela cheia amigável para falhas na inicialização (config do build ausente, erro de JS na raiz). */
export function StartupErrorScreen({ title, message, envProblems, detail, onRetry }: Props) {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined)
  }, [])
  return (
    <YStack flex={1} bg="appBg">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, paddingHorizontal: 24, gap: 16 }}>
        <Text fontSize={26} fontWeight="800" color="brandFg" accessibilityRole="header">
          {title}
        </Text>
        <Text fontSize={18} lineHeight="26px" fontWeight="600" color="brandFg">
          {message}
        </Text>
        {envProblems?.length ? (
          <YStack bg="brandSurface" borderColor="brandBorder" borderWidth={2} rounded={14} p={14} gap={6}>
            {envProblems.map((p) => (
              <NativeText key={p.name} selectable style={{ fontSize: 14, color: isDark ? '#D1EFEF' : '#2B3D34' }}>
                {p.name} — {p.kind === 'missing' ? 'não configurada' : 'inválida'}
              </NativeText>
            ))}
          </YStack>
        ) : null}
        {onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={{ alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: isDark ? '#2E5A4A' : '#1C3C31' }}>
            <NativeText style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Tentar novamente</NativeText>
          </Pressable>
        ) : null}
        {detail ? (
          <NativeText selectable style={{ fontSize: 13, color: isDark ? '#A8B8AF' : '#5B6B62' }}>
            Detalhe técnico: {detail}
          </NativeText>
        ) : null}
      </ScrollView>
    </YStack>
  )
}
