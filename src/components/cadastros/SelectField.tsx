import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { Modal, Pressable, ScrollView, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'

export type SelectOption = {
  value: string
  label: string
}

type SelectFieldProps = {
  label: string
  value: string
  options: SelectOption[]
  placeholder?: string
  error?: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function SelectField({
  label,
  value,
  options,
  placeholder = 'Selecione',
  error,
  onChange,
  disabled = false,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false)
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const selected = options.find((option) => option.value === value)

  return (
    <YStack gap="2" w="100%">
      <Text fontSize={16} fontWeight="700" color="brandFg" lineHeight="22px">
        {label}
      </Text>
      <XStack
        minH={TOQUE_MINIMO}
        items="center"
        justify="space-between"
        bg="brandSurface"
        borderColor={error ? 'brandError' : 'brandBorder'}
        borderWidth={2}
        rounded={16}
        px="3"
        w="100%"
        opacity={{ default: disabled ? 0.7 : 1, press: 0.9 }}
        onPress={disabled ? undefined : () => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={selected?.label ?? placeholder}
        accessibilityState={{ disabled }}>
        <Text fontSize={18} fontWeight="600" color={selected ? 'brandFg' : 'brandMuted'} flex={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={22} color={isDark ? '#A8B8AF' : '#3A5247'} />
      </XStack>
      {error ? (
        <Text fontSize={15} lineHeight="20px" color="brandError" fontWeight="700" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(15, 28, 24, 0.55)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()}>
            <YStack
              bg="cardBg"
              rounded={24}
              p={20}
              gap={12}
              style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: Math.max(insets.bottom, 16) }}>
              <XStack items="center" justify="space-between" minH={56}>
                <Text fontSize={22} fontWeight="800" color="brandFg">
                  {label}
                </Text>
                <XStack
                  minH={56}
                  px={12}
                  items="center"
                  onPress={() => setOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar">
                  <Text fontSize={16} fontWeight="800" color="brandFg">
                    Fechar
                  </Text>
                </XStack>
              </XStack>
              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                {options.map((option) => {
                  const active = option.value === value
                  return (
                    <XStack
                      key={option.value}
                      minH={TOQUE_MINIMO}
                      items="center"
                      justify="space-between"
                      px={12}
                      rounded={16}
                      bg={active ? (isDark ? '#1C3C31' : '#EEF6EF') : 'transparent'}
                      onPress={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={option.label}>
                      <Text fontSize={18} fontWeight={active ? '800' : '600'} color="brandFg" flex={1}>
                        {option.label}
                      </Text>
                      {active ? <Ionicons name="checkmark" size={22} color={isDark ? '#99C2AB' : '#2B3D34'} /> : null}
                    </XStack>
                  )
                })}
              </ScrollView>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </YStack>
  )
}
