import { StatusBar } from 'expo-status-bar'
import type { ReactNode } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, YStack, useThemeName } from 'tamagui'

import { Logo } from '@/components/Logo'
import { KeyboardAwareScrollView } from '@/components/form/KeyboardAwareScrollView'

type AuthScaffoldProps = {
  children: ReactNode
  title: string
  subtitle?: string
  logoSize?: number
}

export function AuthScaffold({ children, title, subtitle, logoSize = 120 }: AuthScaffoldProps) {
  const insets = useSafeAreaInsets()
  const themeName = useThemeName()
  const isDark = themeName.startsWith('dark')

  return (
    <YStack flex={1} bg="brandBg">
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Sem KeyboardAvoidingView nas duas plataformas. iOS: o inset do ScrollView acompanha o teclado sem refazer o
          layout (o padding + LayoutAnimation recentralizava o formulário e o placeholder só se ajustava no fim).
          Android: a janela já redimensiona, então behavior=height dobrava a faixa vazia. */}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: Math.max(insets.top, 16) + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          paddingHorizontal: 24,
          alignItems: 'center',
        }}>
        {/* Sem flex=1/justify=center: em "Criar conta" o bloco é mais alto que a tela e a centralização
            empurrava logo/título para fora do scroll. flexGrow no container já centraliza quando cabe. */}
        <YStack w="100%" maxW={440} gap="4">
          <YStack items="center" gap="3">
            <Logo size={logoSize} />
            <Text
              fontSize={24}
              fontWeight="800"
              color="brandFg"
              text="center"
              letterSpacing={-0.4}
              accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text fontSize={16} lineHeight="24px" color="brandMuted" text="center" fontWeight="500">
                {subtitle}
              </Text>
            ) : null}
          </YStack>
          {children}
        </YStack>
      </KeyboardAwareScrollView>
    </YStack>
  )
}
