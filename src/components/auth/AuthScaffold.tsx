import { StatusBar } from 'expo-status-bar'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
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
      {/* iOS: sem KeyboardAvoidingView. O inset do ScrollView acompanha o teclado sem refazer o layout (o padding
          + LayoutAnimation recentralizava o formulário e o placeholder só se ajustava no fim). Android: como antes. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height" enabled={Platform.OS === 'android'}>
        <KeyboardAwareScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            paddingHorizontal: 24,
            alignItems: 'center',
          }}>
          <YStack w="100%" maxW={440} gap="4" flex={1} justify="center">
            <YStack items="center" gap="3">
              <Logo size={logoSize} />
              <Text
                fontSize={28}
                fontWeight="800"
                color="brandFg"
                text="center"
                letterSpacing={-0.4}
                accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? (
                <Text fontSize={17} lineHeight="24px" color="brandMuted" text="center" fontWeight="500">
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
            {children}
          </YStack>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </YStack>
  )
}
