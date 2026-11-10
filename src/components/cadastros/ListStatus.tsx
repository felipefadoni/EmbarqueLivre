import { Spinner, Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'

type ListStatusProps = {
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyTitle: string
  emptyMessage: string
  onRetry?: () => void
}

export function ListStatus({ loading, error, empty, emptyTitle, emptyMessage, onRetry }: ListStatusProps) {
  if (loading) {
    return (
      <YStack flex={1} items="center" justify="center" py={48} gap={12}>
        <Spinner color="brandPrimary" size="large" />
        <Text fontSize={16} fontWeight="600" color="brandMuted">
          Carregando…
        </Text>
      </YStack>
    )
  }

  if (error) {
    return (
      <YStack flex={1} items="center" justify="center" py={48} gap={16} px={12}>
        <Text fontSize={18} fontWeight="800" color="brandFg" text="center">
          Não foi possível carregar
        </Text>
        <Text fontSize={16} lineHeight="24px" fontWeight="500" color="brandMuted" text="center">
          {error}
        </Text>
        <XStack
          minH={TOQUE_MINIMO}
          px={24}
          items="center"
          justify="center"
          rounded={16}
          bg="brandPrimary"
          opacity={{ press: 0.85 }}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Tentar novamente
          </Text>
        </XStack>
      </YStack>
    )
  }

  if (empty) {
    return (
      <YStack flex={1} items="center" justify="center" py={48} gap={8} px={12}>
        <Text fontSize={20} fontWeight="800" color="brandFg" text="center">
          {emptyTitle}
        </Text>
        <Text fontSize={16} lineHeight="24px" fontWeight="500" color="brandMuted" text="center">
          {emptyMessage}
        </Text>
      </YStack>
    )
  }

  return null
}


export function ListLoadingFooter() {
  return (
    <YStack items="center" justify="center" py={16} minH={56}>
      <Spinner color="brandPrimary" />
    </YStack>
  )
}
