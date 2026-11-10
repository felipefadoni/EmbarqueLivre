import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react'
import { Input, Label, Text, XStack, YStack, type TamaguiElement } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'

export type AuthFieldRef = {
  focus: () => void
}

type AuthFieldProps = {
  label: string
  value: string
  onChangeText: (value: string) => void
  error?: string
  placeholder?: string
  secureTextEntry?: boolean
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  autoCorrect?: boolean
  autoComplete?: React.ComponentProps<typeof Input>['autoComplete']
  textContentType?: React.ComponentProps<typeof Input>['textContentType']
  keyboardType?: React.ComponentProps<typeof Input>['keyboardType']
  returnKeyType?: React.ComponentProps<typeof Input>['returnKeyType']
  onSubmitEditing?: () => void
  editable?: boolean
  rightSlot?: ReactNode
  accessibilityHint?: string
  maxLength?: number
  spellCheck?: boolean
}

export const AuthField = forwardRef<AuthFieldRef, AuthFieldProps>(function AuthField(
  { label, error, rightSlot, accessibilityHint, editable = true, ...inputProps },
  ref,
) {
  const inputRef = useRef<TamaguiElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => {
      const node = inputRef.current as unknown as { focus?: () => void }
      node.focus?.()
    },
  }))

  return (
    <YStack gap="2" w="100%">
      <Label fontSize={16} fontWeight="700" color="brandFg" lineHeight="22px">
        {label}
      </Label>
      <XStack
        minH={TOQUE_MINIMO}
        h={TOQUE_MINIMO}
        items="center"
        bg="brandSurface"
        borderColor={error ? 'brandError' : 'brandBorder'}
        borderWidth={2}
        rounded={16}
        px="3"
        w="100%"
        opacity={editable ? 1 : 0.7}>
        <Input
          ref={inputRef}
          flex={1}
          h="100%"
          fontSize={18}
          fontWeight="600"
          color="brandFg"
          bg="transparent"
          borderWidth={0}
          placeholderTextColor="brandMuted"
          accessibilityLabel={label}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled: !editable }}
          disabled={!editable}
          {...inputProps}
        />
        {rightSlot}
      </XStack>
      {error ? (
        <Text fontSize={15} lineHeight="20px" color="brandError" fontWeight="700" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </YStack>
  )
})
