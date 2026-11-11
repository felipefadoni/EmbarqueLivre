import { Modal, Pressable, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  /** danger (padrão, vermelho: excluir) ou primary (confirmação que não apaga, ex.: finalizar). */
  tone?: 'danger' | 'primary'
  /** Texto do botão enquanto `busy` (padrão: "Excluindo…"). */
  busyLabel?: string
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  busy = false,
  tone = 'danger',
  busyLabel = 'Excluindo…',
}: ConfirmDialogProps) {
  const isDark = useColorScheme() === 'dark'

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(15, 28, 24, 0.55)', justifyContent: 'center', padding: 24 }}
        onPress={busy ? undefined : onCancel}
        accessibilityViewIsModal>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <YStack bg="cardBg" rounded={24} p={24} gap={16}>
            <Text fontSize={22} fontWeight="800" color="brandFg">
              {title}
            </Text>
            <Text fontSize={16} lineHeight="24px" fontWeight="500" color="brandFg">
              {message}
            </Text>
            <YStack gap={10} mt={8}>
              <XStack
                minH={TOQUE_MINIMO}
                items="center"
                justify="center"
                rounded={16}
                bg={tone === 'primary' ? 'brandPrimary' : 'brandError'}
                opacity={{ default: busy ? 0.55 : 1, press: 0.85 }}
                onPress={busy ? undefined : onConfirm}
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
                accessibilityState={{ disabled: busy, busy }}>
                <Text fontSize={18} fontWeight="800" color={tone === 'primary' ? 'brandPrimaryFg' : 'white'}>
                  {busy ? busyLabel : confirmLabel}
                </Text>
              </XStack>
              <XStack
                minH={TOQUE_MINIMO}
                items="center"
                justify="center"
                rounded={16}
                bg={isDark ? '#1C3C31' : '#EEF6EF'}
                opacity={{ press: 0.85 }}
                onPress={busy ? undefined : onCancel}
                accessibilityRole="button"
                accessibilityLabel={cancelLabel}
                accessibilityState={{ disabled: busy }}>
                <Text fontSize={18} fontWeight="800" color="brandFg">
                  {cancelLabel}
                </Text>
              </XStack>
            </YStack>
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
