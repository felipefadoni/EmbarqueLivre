import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useColorScheme } from 'react-native'
import { TamaguiProvider } from 'tamagui'

import { AnimatedSplashOverlay } from '@/components/animated-icon'
import { StartupErrorScreen } from '@/components/StartupErrorScreen'
import { checkPublicEnv } from '@/config/env'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { SyncProvider } from '@/sync/SyncProvider'
import { tamaguiConfig } from '../../tamagui.config'

SplashScreen.preventAutoHideAsync()

/** Avaliado uma vez: envs do build são constantes embutidas no bundle. */
const ENV_PROBLEMS = checkPublicEnv()

/** Erro de JS na raiz: tela amigável (com "Tentar novamente") em vez de fechar/tela em branco. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colorScheme = useColorScheme()
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <StartupErrorScreen
        title="Algo deu errado ao abrir o app"
        message="Tente novamente. Se continuar, feche e abra o app ou atualize-o pela Play Store / App Store."
        detail={error?.message}
        onRetry={() => void retry()}
      />
    </TamaguiProvider>
  )
}

export default function RootLayout() {
  const colorScheme = useColorScheme()

  if (ENV_PROBLEMS.length > 0) {
    return (
      <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
        <StartupErrorScreen
          title="App sem configuração do servidor"
          message="Este build foi gerado sem o endereço do servidor. Configure as variáveis abaixo no ambiente production do EAS e gere um novo build."
          envProblems={ENV_PROBLEMS}
        />
      </TamaguiProvider>
    )
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SyncProvider>
          <AuthProvider>
            <SplashGate />
          </AuthProvider>
        </SyncProvider>
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
