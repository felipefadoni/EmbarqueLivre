import { Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'

export type BarItem = { id: string; label: string; value: number; hint?: string }

/** Barras horizontais simples (sem dependência de gráfico). Largura proporcional ao maior valor. */
export function BarList({ items, color, track, onPress }: { items: BarItem[]; color: string; track: string; onPress?: (item: BarItem) => void }) {
  const max = Math.max(1, ...items.map((item) => item.value))
  return (
    <YStack gap={8}>
      {items.map((item) => (
        <YStack
          key={item.id}
          minH={TOQUE_MINIMO}
          justify="center"
          gap={4}
          opacity={onPress ? { press: 0.85 } : undefined}
          onPress={onPress ? () => onPress(item) : undefined}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={`${item.label}: ${item.value}${item.hint ? `, ${item.hint}` : ''}`}>
          <XStack justify="space-between" gap={8}>
            <Text fontSize={16} fontWeight="700" color="brandFg" numberOfLines={1} flex={1}>
              {item.label}
            </Text>
            <Text fontSize={16} fontWeight="800" color="brandFg">
              {item.value}
            </Text>
          </XStack>
          <YStack h={8} rounded={4} style={{ backgroundColor: track }} overflow="hidden">
            <YStack h={8} rounded={4} style={{ backgroundColor: color, width: `${Math.round((item.value / max) * 100)}%` }} />
          </YStack>
          {item.hint ? (
            <Text fontSize={13} fontWeight="600" color="brandMuted">
              {item.hint}
            </Text>
          ) : null}
        </YStack>
      ))}
    </YStack>
  )
}
