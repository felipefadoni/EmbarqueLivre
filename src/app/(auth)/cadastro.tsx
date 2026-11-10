import { Link, router } from 'expo-router'
import { useRef, useState } from 'react'
import { Button, Spinner, Text, XStack, YStack } from 'tamagui'

import { authApi } from '@/api/client'
import { fieldMessagesFromError, isApiError, userMessage } from '@/api/errors'
import { emailIsValid, nameIsValid, passwordIsValid, resolvedWhatsAppPhone, validatePhoneFields } from '@/api/validation'
import { AuthField, type AuthFieldRef } from '@/components/auth/AuthField'
import { PhoneFields } from '@/components/auth/PhoneFields'
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
  function clearField(field: string) {
    setFieldErrors((current) => ({ ...current, [field]: '' }))
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!nameIsValid(name)) next.name = 'Informe um nome válido (mínimo 2 letras).'
    if (!email.trim()) next.email = 'Informe seu email.'
    else if (!emailIsValid(email)) next.email = 'Informe um email válido.'
    Object.assign(next, validatePhoneFields({ mobilePhone, whatsAppPhone, sameWhatsApp }))
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
        whatsAppPhone: resolvedWhatsAppPhone(mobilePhone, whatsAppPhone, sameWhatsApp),
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

        <PhoneFields
          mobilePhone={mobilePhone}
          whatsAppPhone={whatsAppPhone}
          sameWhatsApp={sameWhatsApp}
          errors={fieldErrors}
          mobileRef={mobileRef}
          whatsAppRef={whatsAppRef}
          onChangeMobilePhone={(value) => {
            setMobilePhone(value)
            clearField('mobilePhone')
          }}
          onChangeWhatsAppPhone={(value) => {
            setWhatsAppPhone(value)
            clearField('whatsAppPhone')
          }}
          onChangeSameWhatsApp={setSameWhatsApp}
          onSubmitMobile={() => (sameWhatsApp ? passwordRef.current?.focus() : whatsAppRef.current?.focus())}
          onSubmitWhatsApp={() => passwordRef.current?.focus()}
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
