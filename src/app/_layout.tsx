import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useColorScheme } from 'react-native'
import { TamaguiProvider } from 'tamagui'

import { AnimatedSplashOverlay } from '@/components/animated-icon'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { tamaguiConfig } from '../../tamagui.config'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const colorScheme = useColorScheme()

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <SplashGate />
        </AuthProvider>
      </ThemeProvider>
    </TamaguiProvider>
  )
}

function SplashGate() {
  const { isLoading } = useAuth()

  return (
    <>
      {!isLoading ? <AnimatedSplashOverlay /> : null}
      {!isLoading ? <RootNavigator /> : null}
    </>
  )
}

function RootNavigator() {
  const { isAuthenticated } = useAuth()

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Protected guard={isAuthenticated} redirectTo="/login">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated} redirectTo="/">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  )
}
