import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
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
}: CadastroFormScreenProps) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <YStack flex={1} bg="appBg">
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {error ? <FormBanner message={error} /> : null}
          {readOnly ? <FormBanner message="Somente leitura. Você não pode alterar este cadastro." tone="info" /> : null}
          {children}
          {readOnly ? null : (
          <>
          <XStack
            minH={TOQUE_PRINCIPAL}
            items="center"
            justify="center"
            rounded={16}
            bg="brandPrimary"
            opacity={{ default: submitting ? 0.55 : 1, press: 0.85 }}
            onPress={submitting ? undefined : onSubmit}
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
            accessibilityState={{ disabled: submitting, busy: submitting }}>
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
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
