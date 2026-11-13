/**
 * Regras puras de teclado (sem React Native), usadas pelos componentes de formulário e testadas em Node.
 *
 * Estratégia única do app:
 * - Formulários com rolagem: ScrollView com `automaticallyAdjustKeyboardInsets` no iOS. O próprio UIKit anima o
 *   contentInset junto com o teclado (mesma duração/curva) e rola o campo focado para cima do teclado, sem refazer o
 *   layout do React. É isso que evita o placeholder "parado" (o KeyboardAvoidingView refazia o layout com
 *   LayoutAnimation e o texto interno do UITextField só se reposicionava no fim da animação).
 * - Folhas presas ao rodapé (modais de seleção com busca): sobem com a altura do teclado quadro a quadro
 *   (Reanimated useAnimatedKeyboard), com altura mínima/máxima limitadas ao espaço que sobra.
 */

export type KeyboardScrollProps = {
  automaticallyAdjustKeyboardInsets?: boolean
  keyboardShouldPersistTaps: 'handled'
  keyboardDismissMode: 'interactive' | 'on-drag'
}

/** Props de teclado para ScrollView/FlatList que contém campos de texto. */
export function keyboardScrollProps(os: string): KeyboardScrollProps {
  if (os === 'ios') {
    return { automaticallyAdjustKeyboardInsets: true, keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'interactive' }
  }
  // Android: a janela já é redimensionada pelo sistema; mantém o comportamento de antes (sem inset automático).
  return { keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag' }
}

/** Folga entre o topo da folha e a área segura de cima quando o teclado está aberto. */
export const SHEET_TOP_GAP = 8

/**
 * Quanto subir uma folha presa ao rodapé. A folha já reserva `bottomInset` (indicador de início) no próprio
 * padding, então só sobe o que o teclado passa disso.
 */
export function sheetKeyboardLift(keyboardHeight: number, bottomInset: number): number {
  'worklet'
  if (!(keyboardHeight > 0)) return 0
  return Math.max(keyboardHeight - Math.max(bottomInset, 0), 0)
}

export type SheetHeightInput = {
  windowHeight: number
  topInset: number
  /** Valor de sheetKeyboardLift (0 com o teclado fechado). */
  lift: number
  /** Altura mínima desejada da folha (ex.: 420). */
  minHeight: number
  /** Fração da tela livre (ex.: 0.85, como o antigo maxHeight '85%'). */
  maxHeightRatio: number
}

/** Limites de altura da folha no espaço que sobra acima do teclado (nunca passa da área segura de cima). */
export function sheetHeightLimits({ windowHeight, topInset, lift, minHeight, maxHeightRatio }: SheetHeightInput): {
  minHeight: number
  maxHeight: number
} {
  'worklet'
  const free = Math.max(windowHeight - Math.max(lift, 0), 0)
  const maxHeight = Math.max(Math.min(free * maxHeightRatio, free - Math.max(topInset, 0) - SHEET_TOP_GAP), 0)
  return { minHeight: Math.min(Math.max(minHeight, 0), maxHeight), maxHeight }
}
