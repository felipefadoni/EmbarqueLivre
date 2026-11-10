import { Link, router } from 'expo-router'
import { useRef, useState } from 'react'
import { Button, Label, Spinner, Switch, Text, XStack, YStack } from 'tamagui'

import { authApi } from '@/api/client'
import { fieldMessagesFromError, isApiError, userMessage } from '@/api/errors'
import { emailIsValid, maskPhoneBR, mobilePhoneIsValid, nameIsValid, passwordIsValid } from '@/api/validation'
import { AuthField, type AuthFieldRef } from '@/components/auth/AuthField'
import { AuthScaffold } from '@/components/auth/AuthScaffold'
import { FormBanner } from '@/components/auth/FormBanner'
import { OfflineNotice } from '@/components/sync/OfflineNotice'
import { PasswordChecklist } from '@/components/auth/PasswordChecklist'
import { useRetryAfter } from '@/features/auth/useRetryAfter'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../tamagui.config'

export default function CadastroScreen() {
  const { retryAfter, setRetryAfter, isCoolingDown } = useRetryAfter()
  const emailRef = useRef<AuthFieldRef>(null)
  const mobileRef = useRef<AuthFieldRef>(null)
  const whatsAppRef = useRef<AuthFieldRef>(null)
  const passwordRef = useRef<AuthFieldRef>(null)
  const confirmRef = useRef<AuthFieldRef>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [whatsAppPhone, setWhatsAppPhone] = useState('')
  const [sameWhatsApp, setSameWhatsApp] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const disabled = loading || isCoolingDown
  const whatsAppValue = sameWhatsApp ? mobilePhone : whatsAppPhone

  function clearField(field: string) {
    setFieldErrors((current) => ({ ...current, [field]: '' }))
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!nameIsValid(name)) next.name = 'Informe um nome válido (mínimo 2 letras).'
    if (!email.trim()) next.email = 'Informe seu email.'
    else if (!emailIsValid(email)) next.email = 'Informe um email válido.'
    if (!mobilePhone.trim()) next.mobilePhone = 'Informe o celular.'
    else if (!mobilePhoneIsValid(mobilePhone)) next.mobilePhone = 'Informe um número de celular válido com DDD.'
    if (!sameWhatsApp) {
      if (!whatsAppPhone.trim()) next.whatsAppPhone = 'Informe o WhatsApp.'
      else if (!mobilePhoneIsValid(whatsAppPhone)) {
        next.whatsAppPhone = 'Informe um número de celular válido com DDD.'
      }
    }
    if (!password) next.password = 'Informe sua senha.'
    else if (!passwordIsValid(password)) {
      next.password = 'A senha precisa ter ao menos 8 caracteres, 1 letra maiúscula e 1 caractere especial.'
    }
    if (password !== confirmPassword) next.confirmPassword = 'As senhas não coincidem.'
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (disabled) return
    setFormError(null)
    if (!validate()) return

    setLoading(true)
    try {
      await authApi.register({
        name: name.trim(),
        email: email.trim(),
        mobilePhone,
        whatsAppPhone: whatsAppValue,
        password,
      })
      router.replace({ pathname: '/login', params: { email: email.trim(), created: '1' } })
    } catch (error) {
      const apiError = isApiError(error) ? error : null
      if (!apiError) {
        setFormError('Ocorreu um erro inesperado. Tente novamente.')
        return
      }
      if (apiError.code === 'RATE_LIMITED') {
        const seconds = apiError.retryAfterSeconds ?? 60
        setRetryAfter(seconds)
        setFormError(userMessage({ ...apiError, retryAfterSeconds: seconds }))
        return
      }
      const fields = fieldMessagesFromError(apiError)
      setFieldErrors(fields)
      if (Object.keys(fields).length > 0 && apiError.code !== 'INTERNAL_ERROR') {
        if (apiError.code === 'EMAIL_ALREADY_REGISTERED' || apiError.code === 'VALIDATION_ERROR') {
          return
        }
      }
      if (Object.keys(fields).length === 0) {
        setFormError(userMessage(apiError))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScaffold
      title="Criar conta"
      subtitle="Cadastre-se para começar."
      logoSize={88}>
      <YStack gap="4" w="100%">
        <OfflineNotice />
        {formError ? <FormBanner message={formError} /> : null}

        <AuthField
          label="Nome"
          value={name}
          onChangeText={(value) => {
            setName(value)
            clearField('name')
          }}
          error={fieldErrors.name}
          placeholder="Maria Silva"
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          maxLength={150}
        />

        <AuthField
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value)
            clearField('email')
          }}
          error={fieldErrors.email}
          placeholder="email@exemplo.com"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => mobileRef.current?.focus()}
        />

        <AuthField
          ref={mobileRef}
          label="Celular"
          value={mobilePhone}
          onChangeText={(value) => {
            setMobilePhone(maskPhoneBR(value))
            clearField('mobilePhone')
          }}
          error={fieldErrors.mobilePhone}
          placeholder="(11) 91234-5678"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="next"
          onSubmitEditing={() => (sameWhatsApp ? passwordRef.current?.focus() : whatsAppRef.current?.focus())}
          maxLength={30}
        />

        <XStack
          items="center"
          gap="3"
          minH={TOQUE_MINIMO}
          onPress={() => setSameWhatsApp((value) => !value)}
          accessibilityRole="switch"
          accessibilityState={{ checked: sameWhatsApp }}
          accessibilityLabel="WhatsApp é o mesmo número">
          <Switch
            size="4"
            checked={sameWhatsApp}
            onCheckedChange={(checked) => setSameWhatsApp(Boolean(checked))}
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
          onChangeText={(value) => {
            setWhatsAppPhone(maskPhoneBR(value))
            clearField('whatsAppPhone')
          }}
          error={fieldErrors.whatsAppPhone}
          placeholder="(11) 91234-5678"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="next"
          editable={!sameWhatsApp}
          onSubmitEditing={() => passwordRef.current?.focus()}
          maxLength={30}
        />

        <YStack gap="2">
          <AuthField
            ref={passwordRef}
            label="Senha"
            value={password}
            onChangeText={(value) => {
              setPassword(value)
              clearField('password')
            }}
            error={fieldErrors.password}
            placeholder="Sua senha"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            maxLength={128}
            rightSlot={
              <Text
                onPress={() => setShowPassword((value) => !value)}
                fontSize={15}
                fontWeight="800"
                color="brandInk"
                pl="2"
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </Text>
            }
          />
          <PasswordChecklist password={password} />
        </YStack>

        <AuthField
          ref={confirmRef}
          label="Confirmar senha"
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value)
            clearField('confirmPassword')
          }}
          error={fieldErrors.confirmPassword}
          placeholder="Repita a senha"
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          maxLength={128}
          rightSlot={
            <Text
              onPress={() => setShowConfirm((value) => !value)}
              fontSize={15}
              fontWeight="800"
              color="brandInk"
              pl="2"
              accessibilityRole="button"
              accessibilityLabel={showConfirm ? 'Ocultar confirmação da senha' : 'Mostrar confirmação da senha'}>
              {showConfirm ? 'Ocultar' : 'Mostrar'}
            </Text>
          }
        />

        <Button
          h={TOQUE_PRINCIPAL}
          bg="brandPrimary"
          color="brandPrimaryFg"
          fontSize={18}
          fontWeight="800"
          rounded={16}
          borderWidth={0}
          disabled={disabled}
          opacity={{ default: disabled ? 0.55 : 1, press: 0.85 }}
          scale="press:0.99"
          icon={loading ? () => <Spinner color="brandPrimaryFg" /> : undefined}
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel="Cadastrar"
          accessibilityState={{ disabled, busy: loading }}>
          {loading ? 'Cadastrando…' : isCoolingDown ? `Aguarde ${retryAfter}s` : 'Cadastrar'}
        </Button>

        <XStack justify="center" items="center" gap="2" flexWrap="wrap" minH={TOQUE_MINIMO}>
          <Text fontSize={16} color="brandFg" fontWeight="500">
            Já tem conta?
          </Text>
          <Link href="/login" asChild>
            <Text
              fontSize={16}
              fontWeight="800"
              color="brandFg"
              textDecorationLine="underline"
              accessibilityRole="link"
              accessibilityLabel="Ir para o login">
              Entrar
            </Text>
          </Link>
        </XStack>
      </YStack>
    </AuthScaffold>
  )
}
