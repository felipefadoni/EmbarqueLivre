import Ionicons from '@expo/vector-icons/Ionicons'
import { useColorScheme } from 'react-native'
import { Input, Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'

type TextFilterFieldProps = {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  keyboardType?: 'default' | 'email-address'
}

/** Campo de texto do painel de filtros (mesmo visual do SelectField: rótulo, borda 2, raio 16, toque mínimo). */
export function TextFilterField({ label, value, placeholder, onChange, keyboardType = 'default' }: TextFilterFieldProps) {
  const isDark = useColorScheme() === 'dark'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  return (
    <YStack gap="2" w="100%">
      <Text fontSize={16} fontWeight="700" color="brandFg" lineHeight="22px">
        {label}
      </Text>
      <XStack minH={TOQUE_MINIMO} items="center" bg="brandSurface" borderColor="brandBorder" borderWidth={2} rounded={16} px="3" gap={8}>
        <Ionicons name="search" size={20} color={iconColor} />
        <Input
          flex={1}
          h="100%"
          fontSize={18}
          fontWeight="600"
          color="brandFg"
          bg="transparent"
          borderWidth={0}
          placeholder={placeholder}
          placeholderTextColor="brandMuted"
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          returnKeyType="search"
          accessibilityLabel={label}
        />
        {value ? (
          <XStack
            minH={TOQUE_MINIMO}
            items="center"
            justify="center"
            style={{ width: 44 }}
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel={`Limpar ${label.toLowerCase()}`}>
            <Ionicons name="close-circle" size={22} color={iconColor} />
          </XStack>
        ) : null}
      </XStack>
    </YStack>
  )
}
