import { Text, XStack, YStack } from 'tamagui'

import { passwordRules } from '@/api/validation'

type PasswordChecklistProps = {
  password: string
}

const ITEMS = [
  { key: 'min', label: 'Mínimo de 8 caracteres', check: passwordRules.min },
  { key: 'upper', label: 'Pelo menos 1 letra maiúscula', check: passwordRules.upper },
  { key: 'special', label: 'Pelo menos 1 caractere especial (ex.: @ # ! $)', check: passwordRules.special },
] as const

export function PasswordChecklist({ password }: PasswordChecklistProps) {
  const tooLong = password.length > 128

  return (
    <YStack gap="1.5" w="100%" accessibilityRole="summary" accessibilityLabel="Requisitos da senha">
      {ITEMS.map((item) => {
        const ok = password.length > 0 && item.check(password)
        return (
          <XStack key={item.key} gap="2" items="center">
            <Text fontSize={18} fontWeight="800" color={ok ? 'brandSuccess' : 'brandMuted'} w={22}>
              {ok ? '✓' : '○'}
            </Text>
            <Text fontSize={15} lineHeight="20px" fontWeight="600" color={ok ? 'brandSuccess' : 'brandMuted'} flex={1}>
              {item.label}
            </Text>
          </XStack>
        )
      })}
      {tooLong ? (
        <Text fontSize={15} color="brandError" fontWeight="700">
          A senha deve ter no máximo 128 caracteres.
        </Text>
      ) : null}
    </YStack>
  )
}
