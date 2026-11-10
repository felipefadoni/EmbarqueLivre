import { Text, YStack } from 'tamagui'

export type StatusTone = 'liberado' | 'bloqueado' | 'sem-historico'

/** Cartão colorido de situação (Liberados / Em carência / Sem histórico). Toque abre a lista filtrada. */
export function StatusCard({ label, value, tone, onPress }: { label: string; value: number; tone: StatusTone; onPress?: () => void }) {
  return (
    <YStack
      flex={1}
      rounded={20}
      bg={tone}
      p={14}
      minH={96}
      justify="space-between"
      opacity={onPress ? { press: 0.85 } : undefined}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}${onPress ? '. Ver animais' : ''}`}>
      <Text fontSize={14} fontWeight="800" color={`${tone}-color`} lineHeight="18px">
        {label}
      </Text>
      <Text fontSize={28} fontWeight="800" color={`${tone}-color`}>
        {value}
      </Text>
    </YStack>
  )
}
