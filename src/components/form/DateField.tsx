import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'
import { DatePickerModal } from './DatePickerModal'
import { formatDatePtBr } from './date'

type DateFieldProps = {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  error?: string
  minimumDate?: Date
  maximumDate?: Date
  optional?: boolean
  disabled?: boolean
  placeholder?: string
}

export function DateField({
  label,
  value,
  onChange,
  error,
  minimumDate,
  maximumDate,
  optional = true,
  disabled = false,
  placeholder = 'Selecionar data',
}: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const isDark = useColorScheme() === 'dark'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const display = value ? formatDatePtBr(value) : placeholder

  function openPicker() {
    if (disabled) return
    setOpen(true)
  }

  return (
    <YStack gap="2" w="100%">
      <Text fontSize={16} fontWeight="700" color="brandFg" lineHeight="22px">
        {label}
      </Text>
      <XStack
        minH={TOQUE_MINIMO}
        items="center"
        bg="brandSurface"
        borderColor={error ? 'brandError' : 'brandBorder'}
        borderWidth={2}
        rounded={16}
        pl={12}
        w="100%"
        opacity={disabled ? 0.7 : 1}>
        <XStack
          flex={1}
          minH={TOQUE_MINIMO}
          items="center"
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={display}
          accessibilityState={{ disabled }}>
          <Text fontSize={18} fontWeight="600" color={value ? 'brandFg' : 'brandMuted'} flex={1}>
            {display}
          </Text>
        </XStack>
        {optional && value && !disabled ? (
          <XStack
            minH={TOQUE_MINIMO}
            items="center"
            justify="center"
            style={{ width: 56, height: 56 }}
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel="Limpar data">
            <Ionicons name="close-circle" size={22} color={iconColor} />
          </XStack>
        ) : null}
        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          style={{ width: 56, height: 56 }}
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel="Abrir calendário"
          accessibilityState={{ disabled }}>
          <Ionicons name="calendar-outline" size={22} color={iconColor} />
        </XStack>
      </XStack>
      {error ? (
        <Text fontSize={15} lineHeight="20px" color="brandError" fontWeight="700" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {open ? (
        <DatePickerModal
          open={open}
          value={value}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          title={label}
          onCancel={() => setOpen(false)}
          onConfirm={(iso) => {
            onChange(iso)
            setOpen(false)
          }}
        />
      ) : null}
    </YStack>
  )
}
