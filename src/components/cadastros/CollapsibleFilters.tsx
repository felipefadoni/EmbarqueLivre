import Ionicons from '@expo/vector-icons/Ionicons'
import type { ReactNode } from 'react'
import { LayoutAnimation, Platform, UIManager, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'

// Arquitetura antiga do Android precisa habilitar o LayoutAnimation (no-op na nova).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

/** Anima a próxima mudança de layout (abrir/fechar o painel) sem dependência extra. */
export function animateFiltersToggle() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
  )
}

type FilterToggleProps = {
  open: boolean
  /** Filtros diferentes do padrão; mostrado como selo quando o painel está fechado. */
  activeCount: number
  onPress: () => void
}

/** Botão de funil: destacado (brandPrimary) com o painel aberto; selo com a contagem quando fechado. */
export function FilterToggle({ open, activeCount, onPress }: FilterToggleProps) {
  const isDark = useColorScheme() === 'dark'
  const color = open ? (isDark ? '#2B3D34' : '#D1EFEF') : isDark ? '#D1EFEF' : '#2B3D34'
  const showBadge = !open && activeCount > 0
  return (
    <XStack
      position="relative"
      items="center"
      justify="center"
      rounded={16}
      borderWidth={2}
      borderColor={open ? 'brandPrimary' : 'brandBorder'}
      bg={open ? 'brandPrimary' : 'brandSurface'}
      opacity={{ press: 0.85 }}
      style={{ width: TOQUE_MINIMO, height: TOQUE_MINIMO }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${open ? 'Fechar' : 'Abrir'} filtros${activeCount > 0 ? `, ${activeCount} ${activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}` : ''}`}>
      <Ionicons name={open ? 'funnel' : 'funnel-outline'} size={22} color={color} />
      {showBadge ? (
        <YStack
          position="absolute"
          t={-6}
          r={-6}
          minW={22}
          h={22}
          px={5}
          rounded={11}
          items="center"
          justify="center"
          bg="brandPrimary"
          borderWidth={2}
          borderColor="appBg">
          <Text fontSize={12} fontWeight="800" color="brandPrimaryFg">
            {activeCount}
          </Text>
        </YStack>
      ) : null}
    </XStack>
  )
}

type CollapsibleFiltersProps = {
  open: boolean
  /** Uma linha com os filtros aplicados, mostrada com o painel fechado (toque abre o painel). */
  summary: string
  onOpen: () => void
  children: ReactNode
}

/** Painel de filtros recolhível. Fechar NÃO limpa os filtros: eles continuam aplicados. */
export function CollapsibleFilters({ open, summary, onOpen, children }: CollapsibleFiltersProps) {
  if (open) return <YStack gap={12}>{children}</YStack>
  return (
    <XStack
      items="center"
      gap={6}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Filtros: ${summary}. Toque para alterar`}>
      <Text fontSize={15} fontWeight="600" color="brandMuted" numberOfLines={1} flex={1}>
        Filtros: {summary}
      </Text>
    </XStack>
  )
}
