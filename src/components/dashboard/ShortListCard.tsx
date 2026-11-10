import type { ReactNode } from 'react'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { AppCard } from './AppCard'
import { TOQUE_MINIMO } from '../../../tamagui.config'

type ShortListCardProps = {
  title: string
  loading?: boolean
  empty?: boolean
  emptyText: string
  children?: ReactNode
  /** Ex.: "Ver todos (12)". */
  footerLabel?: string
  onFooterPress?: () => void
}

/** Cartão com título, lista curta e link "Ver todos". Estados de carregando e vazio. */
export function ShortListCard({ title, loading, empty, emptyText, children, footerLabel, onFooterPress }: ShortListCardProps) {
  return (
    <AppCard>
      <YStack gap={12}>
        <Text fontSize={20} fontWeight="800" color="brandFg">
          {title}
        </Text>
        {loading ? (
          <YStack minH={64} items="center" justify="center">
            <Spinner color="brandPrimary" />
          </YStack>
        ) : empty ? (
          <Text fontSize={16} fontWeight="600" color="brandMuted">
            {emptyText}
          </Text>
        ) : (
          <YStack gap={4}>{children}</YStack>
        )}
        {footerLabel && onFooterPress && !loading && !empty ? (
          <XStack minH={TOQUE_MINIMO} items="center" onPress={onFooterPress} accessibilityRole="button" accessibilityLabel={footerLabel}>
            <Text fontSize={16} fontWeight="800" color="brandFg" textDecorationLine="underline">
              {footerLabel}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </AppCard>
  )
}

/** Linha tocável de lista curta. */
export function ShortListRow({ children, onPress, label }: { children: ReactNode; onPress: () => void; label: string }) {
  return (
    <XStack
      minH={TOQUE_MINIMO}
      items="center"
      gap={12}
      py={6}
      borderBottomWidth={1}
      borderColor="brandBorder"
      opacity={{ press: 0.85 }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}>
      {children}
    </XStack>
  )
}
