import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { FormBanner } from '@/components/auth/FormBanner'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../tamagui.config'

type CadastroFormScreenProps = {
  children: ReactNode
  error?: string | null
  submitLabel: string
  submitting?: boolean
  onSubmit: () => void
  onDelete?: () => void
  deleteLabel?: string
  readOnly?: boolean
  /** Texto do aviso de somente leitura (padrão: cadastro sem permissão). */
  readOnlyMessage?: string
  /** Desabilita o envio sem mostrar "Salvando…" (ex.: tela online sem internet). */
  submitDisabled?: boolean
  /** Conteúdo exibido depois dos botões (ex.: seção de carência no cadastro do animal). */
  footer?: ReactNode
}

export function CadastroFormScreen({
  children,
  error,
  submitLabel,
  submitting = false,
  onSubmit,
  onDelete,
  deleteLabel = 'Excluir',
  readOnly = false,
  readOnlyMessage = 'Somente leitura. Você não pode alterar este cadastro.',
  submitDisabled = false,
  footer,
}: CadastroFormScreenProps) {
  const blocked = submitting || submitDisabled
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <YStack flex={1} bg="appBg">
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 16) + 20, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {error ? <FormBanner message={error} /> : null}
          {readOnly ? <FormBanner message={readOnlyMessage} tone="info" /> : null}
          {children}
          {readOnly ? null : (
          <>
          <XStack
            minH={TOQUE_PRINCIPAL}
            items="center"
            justify="center"
            rounded={16}
            bg="brandPrimary"
            opacity={{ default: blocked ? 0.55 : 1, press: 0.85 }}
            onPress={blocked ? undefined : onSubmit}
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
            accessibilityState={{ disabled: blocked, busy: submitting }}>
            {submitting ? <Spinner color="brandPrimaryFg" /> : null}
            <Text fontSize={18} fontWeight="800" color="brandPrimaryFg" ml={submitting ? 8 : 0}>
              {submitting ? 'Salvando…' : submitLabel}
            </Text>
          </XStack>
          {onDelete ? (
            <XStack
              minH={TOQUE_MINIMO}
              items="center"
              justify="center"
              rounded={16}
              opacity={{ default: submitting ? 0.55 : 1, press: 0.85 }}
              onPress={submitting ? undefined : onDelete}
              accessibilityRole="button"
              accessibilityLabel={deleteLabel}
              accessibilityState={{ disabled: submitting }}>
              <Text fontSize={18} fontWeight="800" color="brandError">
                {deleteLabel}
              </Text>
            </XStack>
          ) : null}
          </>
          )}
          {footer}
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
