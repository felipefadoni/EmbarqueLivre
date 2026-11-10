import { Label, Switch, XStack } from 'tamagui'

import { maskPhoneBR, resolvedWhatsAppPhone } from '@/api/validation'
import { AuthField, type AuthFieldRef } from '@/components/auth/AuthField'
import { TOQUE_MINIMO } from '../../../tamagui.config'

export type PhoneFieldsProps = {
  mobilePhone: string
  whatsAppPhone: string
  sameWhatsApp: boolean
  errors?: Partial<Record<'mobilePhone' | 'whatsAppPhone', string>>
  onChangeMobilePhone: (value: string) => void
  onChangeWhatsAppPhone: (value: string) => void
  onChangeSameWhatsApp: (value: boolean) => void
  mobileRef?: React.Ref<AuthFieldRef>
  whatsAppRef?: React.Ref<AuthFieldRef>
  onSubmitMobile?: () => void
  onSubmitWhatsApp?: () => void
  editable?: boolean
}

/**
 * Celular + switch "WhatsApp é o mesmo número" + WhatsApp.
 * Mesmos campos, máscara e rótulos do signup (src/app/(auth)/cadastro.tsx).
 */
export function PhoneFields({
  mobilePhone,
  whatsAppPhone,
  sameWhatsApp,
  errors = {},
  onChangeMobilePhone,
  onChangeWhatsAppPhone,
  onChangeSameWhatsApp,
  mobileRef,
  whatsAppRef,
  onSubmitMobile,
  onSubmitWhatsApp,
  editable = true,
}: PhoneFieldsProps) {
  const whatsAppValue = resolvedWhatsAppPhone(mobilePhone, whatsAppPhone, sameWhatsApp)
  return (
    <>
      <AuthField
        ref={mobileRef}
        label="Celular"
        value={mobilePhone}
        onChangeText={(value) => onChangeMobilePhone(maskPhoneBR(value))}
        error={errors.mobilePhone}
        placeholder="(11) 91234-5678"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
        onSubmitEditing={onSubmitMobile}
        maxLength={30}
        editable={editable}
      />

      <XStack
        items="center"
        gap="3"
        minH={TOQUE_MINIMO}
        onPress={editable ? () => onChangeSameWhatsApp(!sameWhatsApp) : undefined}
        accessibilityRole="switch"
        accessibilityState={{ checked: sameWhatsApp, disabled: !editable }}
        accessibilityLabel="WhatsApp é o mesmo número">
        <Switch
          size="4"
          checked={sameWhatsApp}
          onCheckedChange={(checked) => onChangeSameWhatsApp(Boolean(checked))}
          disabled={!editable}
          bg={sameWhatsApp ? 'brandPrimary' : 'brandSage'}
          borderColor="brandBorder">
          <Switch.Thumb animation="quick" bg="brandAqua" />
        </Switch>
        <Label fontSize={16} fontWeight="700" color="brandFg" flex={1} lineHeight="22px">
          WhatsApp é o mesmo número
        </Label>
      </XStack>

      <AuthField
        ref={whatsAppRef}
        label="WhatsApp"
        value={whatsAppValue}
        onChangeText={(value) => onChangeWhatsAppPhone(maskPhoneBR(value))}
        error={errors.whatsAppPhone}
        placeholder="(11) 91234-5678"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
        editable={editable && !sameWhatsApp}
        onSubmitEditing={onSubmitWhatsApp}
        maxLength={30}
      />
    </>
  )
}
