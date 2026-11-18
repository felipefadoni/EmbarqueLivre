import Ionicons from '@expo/vector-icons/Ionicons'
import * as WebBrowser from 'expo-web-browser'
import { Linking, useColorScheme, type AccessibilityActionEvent } from 'react-native'
import { Button, Spinner, Text, XStack, YStack } from 'tamagui'

import { CONSENT_LABEL, type LegalLoadState } from '@/features/auth/legalConsent'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../tamagui.config'

type Props = {
  state: LegalLoadState
  accepted: boolean
  onChangeAccepted: (accepted: boolean) => void
  onRetry: () => void
  /** Explicação abaixo da caixa (por que o Cadastrar está desabilitado ou erro do servidor). */
  hint?: string | null
  /** true = hint em tom de erro (depois de um erro da API); senão tom neutro. */
  hintIsError?: boolean
  disabled?: boolean
}

export async function openDocument(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC })
  } catch {
    await Linking.openURL(url).catch(() => undefined)
  }
}

/** Caixa obrigatória "Li e aceito os Termos de Uso e a Política de Privacidade" (LGPD), com links e estados de carga. */
export function LegalConsent({ state, accepted, onChangeAccepted, onRetry, hint, hintIsError, disabled }: Props) {
  const isDark = useColorScheme() === 'dark'

  if (state.status === 'loading') {
    return (
      <XStack gap="3" items="center" minH={TOQUE_PRINCIPAL} accessibilityRole="progressbar" accessibilityLabel="Carregando os Termos de Uso e a Política de Privacidade">
        <Spinner color="brandFg" />
        <Text flex={1} fontSize={16} lineHeight="24px" fontWeight="600" color="brandFg">
          Carregando os Termos de Uso e a Política de Privacidade…
        </Text>
      </XStack>
    )
  }

  if (state.status === 'error') {
    return (
      <YStack gap="3" p={14} rounded={14} bg="brandSurface" borderWidth={2} borderColor="brandBorder" accessibilityRole="alert" accessibilityLiveRegion="polite">
        <XStack gap={10} items="flex-start">
          <Ionicons name="cloud-offline-outline" size={22} color={isDark ? '#F0C36B' : '#8A5A00'} />
          <Text flex={1} fontSize={16} lineHeight="24px" fontWeight="700" color="brandFg">
            {state.message}
          </Text>
        </XStack>
        <Button
          h={TOQUE_MINIMO}
          bg="brandPrimary"
          color="brandPrimaryFg"
          fontSize={16}
          fontWeight="800"
          rounded={14}
          borderWidth={0}
          opacity={{ default: 1, press: 0.85 }}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente carregar os Termos de Uso e a Política de Privacidade">
          Tentar novamente
        </Button>
      </YStack>
    )
  }

  const { termsUrl, privacyUrl } = state.legal
  const toggle = () => {
    if (!disabled) onChangeAccepted(!accepted)
  }
  const actions = [
    { name: 'activate', label: accepted ? 'Desmarcar' : 'Marcar' },
    ...(termsUrl ? [{ name: 'openTerms', label: 'Abrir os Termos de Uso' }] : []),
    ...(privacyUrl ? [{ name: 'openPrivacy', label: 'Abrir a Política de Privacidade' }] : []),
  ]
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') toggle()
    if (event.nativeEvent.actionName === 'openTerms' && termsUrl) void openDocument(termsUrl)
    if (event.nativeEvent.actionName === 'openPrivacy' && privacyUrl) void openDocument(privacyUrl)
  }
  const linkProps = { fontWeight: '800', color: 'brandFg', textDecorationLine: 'underline' } as const

  return (
    <YStack gap="2">
      <XStack
        gap="3"
        items="center"
        minH={TOQUE_PRINCIPAL}
        py="2"
        onPress={toggle}
        accessible
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted, disabled: Boolean(disabled) }}
        accessibilityLabel={CONSENT_LABEL}
        accessibilityHint={termsUrl || privacyUrl ? 'Toque duas vezes para marcar. Use as ações para abrir os documentos.' : undefined}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}>
        <YStack
          w={36}
          h={36}
          rounded={8}
          borderWidth={3}
          borderColor={accepted ? 'brandPrimary' : 'brandBorder'}
          bg={accepted ? 'brandPrimary' : 'brandBg'}
          items="center"
          justify="center">
          {accepted ? <Ionicons name="checkmark" size={22} color={isDark ? '#2B3D34' : '#D1EFEF'} /> : null}
        </YStack>
        <Text flex={1} fontSize={16} lineHeight="26px" fontWeight="600" color="brandFg">
          Li e aceito os{' '}
          {termsUrl ? (
            <Text {...linkProps} fontSize={16} onPress={() => void openDocument(termsUrl)}>
              Termos de Uso
            </Text>
          ) : (
            'Termos de Uso'
          )}{' '}
          e a{' '}
          {privacyUrl ? (
            <Text {...linkProps} fontSize={16} onPress={() => void openDocument(privacyUrl)}>
              Política de Privacidade
            </Text>
          ) : (
            'Política de Privacidade'
          )}
        </Text>
      </XStack>
      {hint ? (
        <Text
          fontSize={16}
          lineHeight="22px"
          fontWeight="700"
          color={hintIsError ? 'brandError' : 'brandMuted'}
          accessibilityLiveRegion={hintIsError ? 'assertive' : 'polite'}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  )
}
