import { Text, XStack } from 'tamagui'

type WithdrawalBadgeProps = {
  /** true = em carência (vermelho "bloqueado"); false = livre/encerrada (verde "liberado"). */
  active: boolean
  activeLabel: string
  inactiveLabel: string
}

/** Selo de carência compartilhado (seção Carência do animal e lista de lançamentos). */
export function WithdrawalBadge({ active, activeLabel, inactiveLabel }: WithdrawalBadgeProps) {
  const label = active ? activeLabel : inactiveLabel
  return (
    <XStack px={12} py={6} rounded={999} bg={active ? 'bloqueado' : 'liberado'} items="center" accessibilityLabel={label}>
      <Text fontSize={14} fontWeight="800" color={active ? 'bloqueado-color' : 'liberado-color'}>
        {label}
      </Text>
    </XStack>
  )
}
