import type { ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { YStack } from 'tamagui'

type AppCardProps = {
  children: ReactNode
  padded?: boolean
}

export function AppCard({ children, padded = true }: AppCardProps) {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'

  return (
    <YStack
      bg="cardBg"
      rounded={24}
      p={padded ? 20 : 0}
      w="100%"
      style={{
        shadowColor: '#1C3C31',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.35 : 0.1,
        shadowRadius: 16,
        elevation: 3,
      }}>
      {children}
    </YStack>
  )
}
