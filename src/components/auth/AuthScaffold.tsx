import { StatusBar } from 'expo-status-bar'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, YStack, useThemeName } from 'tamagui'

import { Logo } from '@/components/Logo'

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
        </ScrollView>
      </KeyboardAvoidingView>
    </YStack>
  )
}
