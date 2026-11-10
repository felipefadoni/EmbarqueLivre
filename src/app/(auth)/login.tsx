import { Link, useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { Button, Spinner, Text, XStack, YStack } from 'tamagui'

import { fieldMessagesFromError, isApiError, userMessage } from '@/api/errors'
import { emailIsValid } from '@/api/validation'
import { AuthField, type AuthFieldRef } from '@/components/auth/AuthField'
import { AuthScaffold } from '@/components/auth/AuthScaffold'
import { FormBanner } from '@/components/auth/FormBanner'
import { useAuth } from '@/features/auth/AuthProvider'
import { useRetryAfter } from '@/features/auth/useRetryAfter'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../tamagui.config'

const CONTA_CRIADA = 'Conta criada! Entre com seu email e senha.'
const CONTA_NAO_VERIFICADA =
  'Sua conta foi criada, mas a API ainda exige a verificação do email e do WhatsApp antes de entrar.'

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default function LoginScreen() {
  const { login } = useAuth()
  const { retryAfter, setRetryAfter, isCoolingDown } = useRetryAfter()
  const passwordRef = useRef<AuthFieldRef>(null)
  const params = useLocalSearchParams<{ email?: string | string[]; created?: string | string[] }>()
  const emailParam = firstParam(params.email)
  const createdParam = firstParam(params.created)

  const [email, setEmail] = useState(emailParam ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(createdParam === '1' ? CONTA_CRIADA : null)
  const [formTone, setFormTone] = useState<'error' | 'info'>(createdParam === '1' ? 'info' : 'error')
  const [loading, setLoading] = useState(false)

  const disabled = loading || isCoolingDown

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!email.trim()) next.email = 'Informe seu email.'
    else if (!emailIsValid(email)) next.email = 'Informe um email válido.'
    if (!password) next.password = 'Informe sua senha.'
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (disabled) return
    setFormError(null)
    if (!validate()) return

    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch (error) {
      const apiError = isApiError(error) ? error : null
      if (!apiError) {
        setFormTone('error')
        setFormError('Ocorreu um erro inesperado. Tente novamente.')
        return
      }

      if (apiError.code === 'ACCOUNT_NOT_VERIFIED') {
        setFormTone('info')
        setFormError(CONTA_NAO_VERIFICADA)
        return
      }
      if (apiError.code === 'ACCOUNT_SUSPENDED') {
        setFormTone('error')
        setFormError(userMessage(apiError))
        return
      }
      if (apiError.code === 'RATE_LIMITED') {
        const seconds = apiError.retryAfterSeconds ?? 60
        setRetryAfter(seconds)
        setFormTone('error')
        setFormError(userMessage({ ...apiError, retryAfterSeconds: seconds }, { rateLimitContext: 'login' }))
        return
      }

      const fields = fieldMessagesFromError(apiError)
      setFieldErrors(fields)
      if (apiError.code === 'VALIDATION_ERROR' && Object.keys(fields).length > 0) {
        setFormError(null)
        return
      }
      setFormTone('error')
      setFormError(userMessage(apiError, { rateLimitContext: 'login' }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScaffold title="Entrar" subtitle="Acesse sua conta para conferir o curral." logoSize={128}>
      <YStack gap="4" w="100%">
        {formError ? <FormBanner message={formError} tone={formTone} /> : null}

        <AuthField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value)
            setFieldErrors((current) => ({ ...current, email: '' }))
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
          onSubmitEditing={() => passwordRef.current?.focus()}
          accessibilityHint="Informe o email da sua conta"
        />

        <AuthField
          ref={passwordRef}
          label="Senha"
          value={password}
          onChangeText={(value) => {
            setPassword(value)
            setFieldErrors((current) => ({ ...current, password: '' }))
          }}
          error={fieldErrors.password}
          placeholder="Sua senha"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          accessibilityHint="Informe a senha da sua conta"
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
          accessibilityLabel="Entrar"
          accessibilityState={{ disabled, busy: loading }}>
          {loading ? 'Entrando…' : isCoolingDown ? `Aguarde ${retryAfter}s` : 'Entrar'}
        </Button>

        <XStack justify="center" items="center" gap="2" flexWrap="wrap" minH={TOQUE_MINIMO}>
          <Text fontSize={16} color="brandFg" fontWeight="500">
            Ainda não tem conta?
          </Text>
          <Link href="/cadastro" asChild>
            <Text
              fontSize={16}
              fontWeight="800"
              color="brandFg"
              textDecorationLine="underline"
              accessibilityRole="link"
              accessibilityLabel="Criar conta">
              Criar conta
            </Text>
          </Link>
        </XStack>
      </YStack>
    </AuthScaffold>
  )
}
