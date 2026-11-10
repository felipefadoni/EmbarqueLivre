import Ionicons from '@expo/vector-icons/Ionicons'
import { useColorScheme } from 'react-native'
import { Text, XStack } from 'tamagui'

import { useIsOnline } from '@/sync/hooks'

type OfflineNoticeProps = {
  /** Texto específico da tela (o padrão serve para login/cadastro). */
  message?: string
}

/** Aviso para telas que precisam da API online (login, cadastro, escolha do master). */
export function OfflineNotice({ message = 'Sem internet. Entrar e criar conta precisam de conexão.' }: OfflineNoticeProps) {
  const online = useIsOnline()
  const isDark = useColorScheme() === 'dark'
  if (online) return null
  return (
    <XStack
      gap={10}
      items="center"
      px={14}
      py={12}
      rounded={14}
      bg="brandSurface"
      borderWidth={2}
      borderColor="brandBorder"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={22} color={isDark ? '#F0C36B' : '#8A5A00'} />
      <Text flex={1} fontSize={15} lineHeight="20px" fontWeight="700" color="brandFg">
        {message}
      </Text>
    </XStack>
  )
}
