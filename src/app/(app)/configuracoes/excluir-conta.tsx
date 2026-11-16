import Ionicons from '@expo/vector-icons/Ionicons'
import { router, Stack, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ScrollView, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, Spinner, Text, XStack, YStack } from 'tamagui'

import { accountApi } from '@/api/account'
import { endSessionKeepData } from '@/api/client'
import { toApiError } from '@/api/errors'
import { AuthField } from '@/components/auth/AuthField'
import { FormBanner } from '@/components/auth/FormBanner'
import { useAuth } from '@/features/auth/AuthProvider'
import { useRetryAfter } from '@/features/auth/useRetryAfter'
import {
  canSubmitDeletion,
  DELETION_PASSWORD_MAX,
  deletionReducer,
  deletionWarning,
  formatCountdown,
  initialDeletionState,
  mapDeletionError,
  unsentChangesWarning,
  type UnsentSummary,
} from '@/features/account/accountDeletion'
import { db } from '@/sync'
import { useIsOnline } from '@/sync/hooks'
import { countUnsentChanges } from '@/sync/logout'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../../tamagui.config'

const CONFIRM_LABEL = 'Entendo que isso não pode ser desfeito'

// Vermelho com contraste AA nos dois temas (o texto do botão muda junto).
const RED = { light: '#8B1515', dark: '#FF8A80' } as const
const ON_RED = { light: '#FFFFFF', dark: '#3B0A0A' } as const
type Red = (typeof RED)[keyof typeof RED]

export default function ExcluirContaScreen() {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  const { deleteAccount } = useAuth()
  const online = useIsOnline()
  const { retryAfter, setRetryAfter, isCoolingDown } = useRetryAfter()
  const [state, dispatch] = useReducer(deletionReducer, initialDeletionState)
  const [showPassword, setShowPassword] = useState(false)
  const [unsent, setUnsent] = useState<UnsentSummary | null>(null)
  // Trava síncrona contra toque duplo (o reducer também ignora SUBMIT fora de 'ready').
  const submittingRef = useRef(false)

  const red: Red = isDark ? RED.dark : RED.light
  const onRed = isDark ? ON_RED.dark : ON_RED.light
  const busy = state.phase === 'submitting' || state.phase === 'deleted'

  // Preview: carrega ao abrir, no "Tentar novamente" e depois de um 409 (o reducer volta para 'loading').
  useEffect(() => {
    if (state.phase !== 'loading') return
    let active = true
    accountApi
      .deletionPreview()
      .then((preview) => {
        if (active) dispatch({ type: 'PREVIEW_LOADED', preview })
      })
      .catch((error: unknown) => {
        if (active) dispatch({ type: 'PREVIEW_FAILED', error: toApiError(error) })
      })
    return () => {
      active = false
    }
  }, [state.phase])

  // Alterações não enviadas: recontadas sempre que a tela volta ao foco (ex.: depois de resolver Pendências).
  useFocusEffect(
    useCallback(() => {
      let active = true
      countUnsentChanges(db)
        .then((counts) => {
          if (active) setUnsent({ uploads: counts.uploads, rejections: counts.rejections })
        })
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, []),
  )

  const canSubmit = canSubmitDeletion(state, { coolingDown: isCoolingDown, online })

  async function onSubmit() {
    if (submittingRef.current || !canSubmit || !state.preview) return
    submittingRef.current = true
    dispatch({ type: 'SUBMIT' })
    try {
      await deleteAccount({ password: state.password, scope: state.preview.scope }, (result) =>
        dispatch({ type: 'SUBMIT_SUCCEEDED', result }),
      )
      // O AuthProvider limpa tudo e volta ao login com "Conta excluída".
    } catch (error) {
      const apiError = toApiError(error)
      dispatch({ type: 'SUBMIT_FAILED', error: apiError })
      const action = mapDeletionError(apiError)
      if (action.kind === 'rate-limited') setRetryAfter(Math.ceil(action.retryAfterSeconds))
    } finally {
      submittingRef.current = false
    }
  }

  function goBack() {
    if (busy) return
    if (router.canGoBack()) router.back()
    else router.replace('/configuracoes')
  }

  return (
    <YStack flex={1} bg="appBg">
      <Stack.Screen options={{ title: 'Excluir minha conta', headerBackVisible: !busy, gestureEnabled: !busy }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 18 }}>
        {state.phase === 'loading' ? (
          <XStack gap="3" items="center" minH={TOQUE_PRINCIPAL} accessibilityRole="progressbar" accessibilityLabel="Carregando o que será excluído">
            <Spinner color="brandFg" />
            <Text flex={1} fontSize={18} lineHeight="26px" fontWeight="600" color="brandFg">
              Carregando o que será excluído…
            </Text>
          </XStack>
        ) : null}

        {state.phase === 'preview-error' ? (
          <MessageCard icon="cloud-offline-outline" iconColor={isDark ? '#F0C36B' : '#8A5A00'} message={state.message ?? ''}>
            <Button
              h={TOQUE_PRINCIPAL}
              bg="brandPrimary"
              color="brandPrimaryFg"
              fontSize={18}
              fontWeight="800"
              rounded={16}
              borderWidth={0}
              opacity={{ default: 1, press: 0.85 }}
              onPress={() => dispatch({ type: 'PREVIEW_REQUESTED' })}
              accessibilityRole="button"
              accessibilityLabel="Tentar novamente">
              Tentar novamente
            </Button>
            <CancelButton onPress={goBack} label="Voltar" />
          </MessageCard>
        ) : null}

        {state.phase === 'forbidden' ? (
          <MessageCard icon="shield-outline" iconColor={red} message={state.message ?? ''}>
            <CancelButton onPress={goBack} label="Voltar" />
          </MessageCard>
        ) : null}

        {state.phase === 'session-ended' ? (
          <MessageCard icon="log-in-outline" iconColor={red} message={state.message ?? ''}>
            <Button
              h={TOQUE_PRINCIPAL}
              bg="brandPrimary"
              color="brandPrimaryFg"
              fontSize={18}
              fontWeight="800"
              rounded={16}
              borderWidth={0}
              opacity={{ default: 1, press: 0.85 }}
              // Encerra só a sessão (como na expiração normal): dados e pendências ficam no aparelho.
              onPress={() => void endSessionKeepData()}
              accessibilityRole="button"
              accessibilityLabel="Ir para o login">
              Ir para o login
            </Button>
          </MessageCard>
        ) : null}

        {state.phase === 'deleted' ? (
          <YStack gap="3" items="center" py="6" accessibilityLiveRegion="assertive" accessibilityRole="alert">
            <Ionicons name="checkmark-circle" size={64} color={isDark ? '#99C2AB' : '#2B3D34'} />
            <Text fontSize={24} fontWeight="800" color="brandFg" text="center">
              Conta excluída
            </Text>
            <XStack gap="3" items="center">
              <Spinner color="brandFg" />
              <Text fontSize={18} lineHeight="26px" fontWeight="600" color="brandFg">
                Apagando os dados deste aparelho…
              </Text>
            </XStack>
          </YStack>
        ) : null}

        {(state.phase === 'ready' || state.phase === 'submitting') && state.preview ? (
          <>
            {state.notice ? <FormBanner message={state.notice.message} tone={state.notice.tone} /> : null}

            <WarningCard red={red} {...deletionWarning(state.preview)} />

            <UnsentCard unsent={unsent} />

            <AuthField
              label="Sua senha atual"
              value={state.password}
              onChangeText={(password) => dispatch({ type: 'PASSWORD_CHANGED', password })}
              error={state.passwordError ?? undefined}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              maxLength={DELETION_PASSWORD_MAX}
              editable={state.phase === 'ready'}
              accessibilityHint="Digite a senha que você usa para entrar no aplicativo"
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

            <ConfirmCheckbox
              checked={state.confirmed}
              disabled={state.phase !== 'ready'}
              color={red}
              onChange={(confirmed) => dispatch({ type: 'CONFIRMED_CHANGED', confirmed })}
            />

            {!online ? (
              <Text fontSize={16} lineHeight="22px" fontWeight="700" color="brandError" accessibilityLiveRegion="polite">
                Sem internet. Conecte-se para excluir a conta.
              </Text>
            ) : null}

            <Button
              h={TOQUE_PRINCIPAL}
              minH={TOQUE_PRINCIPAL}
              bg={red}
              color={onRed}
              fontSize={19}
              fontWeight="800"
              rounded={16}
              borderWidth={0}
              disabled={!canSubmit}
              opacity={{ default: canSubmit || state.phase === 'submitting' ? 1 : 0.45, press: 0.85 }}
              icon={state.phase === 'submitting' ? () => <Spinner color={onRed} /> : undefined}
              onPress={() => void onSubmit()}
              accessibilityRole="button"
              accessibilityLabel="Excluir minha conta"
              accessibilityState={{ disabled: !canSubmit, busy: state.phase === 'submitting' }}
              accessibilityHint={canSubmit ? 'Exclui a conta para sempre' : 'Digite a senha e marque a confirmação para liberar'}>
              {state.phase === 'submitting'
                ? 'Excluindo…'
                : isCoolingDown
                  ? `Aguarde ${formatCountdown(retryAfter)}`
                  : 'Excluir minha conta'}
            </Button>

            {state.phase === 'ready' && !canSubmit && !isCoolingDown && online ? (
              <Text fontSize={16} lineHeight="22px" fontWeight="600" color="brandMuted" text="center">
                Para liberar o botão, digite a senha e marque a caixa acima.
              </Text>
            ) : null}

            <CancelButton onPress={goBack} label="Cancelar" disabled={state.phase === 'submitting'} />
          </>
        ) : null}
      </ScrollView>
    </YStack>
  )
}

function WarningCard({ title, paragraphs, red }: { title: string; paragraphs: string[]; red: Red }) {
  return (
    <YStack gap="3" p={18} rounded={18} borderWidth={3} borderColor={red} bg="brandSurface" accessibilityRole="alert">
      <XStack gap="3" items="center">
        <Ionicons name="warning" size={30} color={red} />
        <Text flex={1} fontSize={22} lineHeight="28px" fontWeight="800" color={red}>
          {title}
        </Text>
      </XStack>
      {paragraphs.map((text) => (
        <Text key={text} fontSize={18} lineHeight="26px" fontWeight="600" color="brandFg">
          {text}
        </Text>
      ))}
    </YStack>
  )
}

function UnsentCard({ unsent }: { unsent: UnsentSummary | null }) {
  const warning = unsent ? unsentChangesWarning(unsent) : null
  return (
    <YStack gap="3" p={16} rounded={16} bg="brandSurface" borderWidth={2} borderColor="brandBorder">
      <Text fontSize={17} lineHeight="24px" fontWeight="700" color="brandFg">
        {warning ?? 'Alterações deste aparelho que ainda não foram sincronizadas serão perdidas. Neste momento não há nenhuma pendente.'}
      </Text>
      {unsent && unsent.rejections > 0 ? (
        <Button
          h={TOQUE_MINIMO}
          bg="brandBg"
          color="brandFg"
          fontSize={17}
          fontWeight="800"
          rounded={14}
          borderWidth={2}
          borderColor="brandBorder"
          opacity={{ default: 1, press: 0.85 }}
          onPress={() => router.push('/configuracoes/pendencias')}
          accessibilityRole="button"
          accessibilityLabel="Ver pendências antes de excluir">
          Ver pendências
        </Button>
      ) : null}
    </YStack>
  )
}

function ConfirmCheckbox({
  checked,
  disabled,
  color,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  color: Red
  onChange: (checked: boolean) => void
}) {
  const toggle = () => {
    if (!disabled) onChange(!checked)
  }
  return (
    <XStack
      gap="3"
      items="center"
      minH={TOQUE_PRINCIPAL}
      py="2"
      onPress={toggle}
      opacity={disabled ? 0.6 : 1}
      accessible
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={CONFIRM_LABEL}
      accessibilityActions={[{ name: 'activate', label: checked ? 'Desmarcar' : 'Marcar' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') toggle()
      }}>
      <YStack
        w={40}
        h={40}
        rounded={8}
        borderWidth={3}
        borderColor={checked ? color : 'brandBorder'}
        bg={checked ? color : 'brandBg'}
        items="center"
        justify="center">
        {checked ? <Ionicons name="checkmark" size={30} color="#FFFFFF" /> : null}
      </YStack>
      <Text flex={1} fontSize={19} lineHeight="26px" fontWeight="700" color="brandFg">
        {CONFIRM_LABEL}
      </Text>
    </XStack>
  )
}

function MessageCard({
  icon,
  iconColor,
  message,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap
  iconColor: string
  message: string
  children?: React.ReactNode
}) {
  return (
    <YStack gap="4" p={18} rounded={18} bg="brandSurface" borderWidth={2} borderColor="brandBorder" accessibilityRole="alert" accessibilityLiveRegion="polite">
      <XStack gap="3" items="flex-start">
        <Ionicons name={icon} size={28} color={iconColor} />
        <Text flex={1} fontSize={18} lineHeight="26px" fontWeight="700" color="brandFg">
          {message}
        </Text>
      </XStack>
      {children}
    </YStack>
  )
}

function CancelButton({ onPress, label, disabled = false }: { onPress: () => void; label: string; disabled?: boolean }) {
  return (
    <Button
      h={TOQUE_PRINCIPAL}
      bg="transparent"
      color="brandFg"
      fontSize={18}
      fontWeight="800"
      rounded={16}
      borderWidth={2}
      borderColor="brandBorder"
      disabled={disabled}
      opacity={{ default: disabled ? 0.5 : 1, press: 0.85 }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}>
      {label}
    </Button>
  )
}
