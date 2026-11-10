import { Text, YStack } from 'tamagui'

type FormBannerProps = {
  message: string
  tone?: 'error' | 'info'
}

export function FormBanner({ message, tone = 'error' }: FormBannerProps) {
  const isError = tone === 'error'
  return (
    <YStack
      bg={isError ? 'brandError' : 'brandSage'}
      p="3"
      rounded={16}
      w="100%"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert">
      <Text fontSize={16} lineHeight="22px" fontWeight="700" color={isError ? 'white' : 'brandInk'}>
        {message}
      </Text>
    </YStack>
  )
}
