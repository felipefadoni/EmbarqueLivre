import type { ReactNode } from 'react'
import { Pressable, useWindowDimensions } from 'react-native'
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { sheetHeightLimits, sheetKeyboardLift } from './keyboardLayout'

type KeyboardSheetProps = {
  /** Toque no fundo escuro. */
  onDismiss: () => void
  /** Altura mínima da folha com o teclado fechado (é reduzida se o teclado não deixar espaço). */
  minHeight: number
  /** Fração máxima da tela livre (padrão 0.85). */
  maxHeightRatio?: number
  children: ReactNode
}

/**
 * Fundo + folha presa ao rodapé para usar dentro de um Modal transparente. A folha sobe junto com o teclado,
 * quadro a quadro (Reanimated, já nativo no app), então a busca e a lista ficam acima do teclado.
 * O filho deve ser o container visual da folha (fundo, cantos, padding) com flexGrow/flexShrink 1.
 */
export function KeyboardSheet({ onDismiss, minHeight, maxHeightRatio = 0.85, children }: KeyboardSheetProps) {
  const keyboard = useAnimatedKeyboard()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const topInset = insets.top
  const bottomInset = insets.bottom

  const liftStyle = useAnimatedStyle(() => ({ paddingBottom: sheetKeyboardLift(keyboard.height.value, bottomInset) }))
  const sheetStyle = useAnimatedStyle(() =>
    sheetHeightLimits({
      windowHeight,
      topInset,
      lift: sheetKeyboardLift(keyboard.height.value, bottomInset),
      minHeight,
      maxHeightRatio,
    }),
  )

  return (
    <Pressable
      style={{ flex: 1, backgroundColor: 'rgba(15, 28, 24, 0.55)' }}
      onPress={onDismiss}
      accessible={false}>
      <Animated.View pointerEvents="box-none" style={[{ flex: 1, justifyContent: 'flex-end' }, liftStyle]}>
        <Animated.View style={[{ flexShrink: 1 }, sheetStyle]}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ flexGrow: 1, flexShrink: 1 }} accessible={false}>
            {children}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Pressable>
  )
}
