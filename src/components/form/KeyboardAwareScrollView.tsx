import { forwardRef } from 'react'
import { Platform, ScrollView, type ScrollViewProps } from 'react-native'

import { keyboardScrollProps } from './keyboardLayout'

/** Props de teclado do app para ScrollView/FlatList com campos (ver keyboardLayout.ts). */
export const KEYBOARD_SCROLL_PROPS = keyboardScrollProps(Platform.OS)

/**
 * ScrollView padrão de formulário: no iOS o teclado ajusta o inset de baixo e rola o campo focado para a vista,
 * na mesma animação do teclado (funciona abaixo de header nativo, sem keyboardVerticalOffset).
 * Não envolver em KeyboardAvoidingView (o ajuste ficaria em dobro).
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(props, ref) {
  return <ScrollView ref={ref} {...KEYBOARD_SCROLL_PROPS} {...props} />
})
