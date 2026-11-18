import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useRef, useState } from 'react'
import { BackHandler, ScrollView, StyleSheet, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, Spinner, Text, YStack } from 'tamagui'

import { acceptLegal } from '@/api/legal'
import { isApiError } from '@/api/errors'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { useAuth } from '@/features/auth/AuthProvider'
import { acceptanceErrorAction, reacceptanceCopy, REACCEPT_MESSAGES, type LegalStatus } from '@/features/auth/legalReacceptance'
import { db } from '@/sync'
import { countUnsentChanges, logoutWithGuard } from '@/sync/logout'

import { openDocument } from './LegalConsent'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../tamagui.config'

type Props = {
  status: LegalStatus
  onAccepted: (legal: LegalStatus) => void
  onReload: () => void
}

/**
 * Tela BLOQUEANTE de re-aceite (Termos/Política atualizados). Fica por cima das abas (que continuam montadas: sync,
 * fila e envio de fotos seguem rodando por baixo). Só "Aceitar" ou "Sair da conta". Fonte e botões grandes.
 */
export function LegalReacceptanceGate({ status, onAccepted, onReload }: Props) {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  const { logout } = useAuth()
  const copy = reacceptanceCopy(status)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const [confirmCount, setConfirmCount] = useState<number | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null)

  // Voltar do Android não fecha a tela (ela é obrigatória); "Sair da conta" é a saída.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => sub.remove()
  }, [])

  function onAcceptPress() {
    // Envio duplo: ref (síncrono) + botão desabilitado. A API também é idempotente (recorded=false).
    if (submittingRef.current || loggingOut) return
    submittingRef.current = true
    setSubmitting(true)
    setMessage(null)
    acceptLegal({ termsVersion: status.termsVersion, privacyVersion: status.privacyVersion })
      .then(
        (result) => onAccepted(result.legal),
        (error: unknown) => {
          const action = isApiError(error) ? acceptanceErrorAction(error) : { kind: 'retry' as const, message: REACCEPT_MESSAGES.unknown }
          setMessage(action.message)
          // Versão mudou: recarrega o estado e pede o aceite de novo (não reenvia sozinho).
          if (action.kind === 'reload') onReload()
        },
      )
      .finally(() => {
        submittingRef.current = false
        setSubmitting(false)
      })
  }

  function askConfirm(total: number) {
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve
      setConfirmCount(total)
    })
  }

  function answerConfirm(ok: boolean) {
    confirmResolver.current?.(ok)
    confirmResolver.current = null
    if (!ok) setConfirmCount(null)
  }

  // Mesma saída das Configurações: avisa se há alterações não enviadas antes de apagar o banco local.
  async function onLogoutPress() {
    if (loggingOut || submittingRef.current) return
    try {
      await logoutWithGuard({
        count: () => countUnsentChanges(db),
        confirm: askConfirm,
        logout: async () => {
          setLoggingOut(true)
          await logout()
        },
      })
    } finally {
      setLoggingOut(false)
      setConfirmCount(null)
    }
  }

  const linkButton = (label: string, url: string) => (
    <Button
      key={label}
      minH={TOQUE_PRINCIPAL}
      bg="brandSurface"
      borderWidth={2}
      borderColor="brandBorder"
      rounded={14}
      onPress={() => void openDocument(url)}
      icon={<Ionicons name="document-text-outline" size={22} color={isDark ? '#E8F0EA' : '#1F3A2E'} />}
      accessibilityRole="link"
      accessibilityLabel={label}>
      <Text fontSize={17} fontWeight="800" color="brandFg">
        {label}
      </Text>
    </Button>
  )

  return (
    <YStack style={StyleSheet.absoluteFill} z={1000} bg="appBg" accessibilityViewIsModal>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 20 }}>
        <Ionicons name="shield-checkmark-outline" size={42} color={isDark ? '#7FD1A3' : '#1F7A4D'} />
        <Text fontSize={24} lineHeight="36px" fontWeight="800" color="brandFg" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text fontSize={18} lineHeight="30px" fontWeight="500" color="brandFg">
          {copy.message}
        </Text>
        <YStack gap="3">
          {copy.showPrivacyLink && status.privacyUrl ? linkButton('Ler a Política de Privacidade', status.privacyUrl) : null}
          {copy.showTermsLink && status.termsUrl ? linkButton('Ler os Termos de Uso', status.termsUrl) : null}
        </YStack>
        {message ? (
          <Text fontSize={16} lineHeight="26px" fontWeight="700" color="brandError" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
        <Button
          minH={TOQUE_PRINCIPAL}
          bg="brandPrimary"
          rounded={14}
          borderWidth={0}
          disabled={submitting || loggingOut}
          opacity={submitting || loggingOut ? 0.7 : 1}
          onPress={onAcceptPress}
          icon={submitting ? <Spinner color="brandPrimaryFg" /> : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting || loggingOut, busy: submitting }}
          accessibilityLabel="Aceitar">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            {submitting ? 'Enviando…' : 'Aceitar'}
          </Text>
        </Button>
        <Button
          minH={TOQUE_MINIMO}
          bg="transparent"
          borderWidth={2}
          borderColor="brandBorder"
          rounded={14}
          disabled={submitting || loggingOut}
          onPress={() => void onLogoutPress()}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta">
          <Text fontSize={17} fontWeight="700" color="brandFg">
            {loggingOut ? 'Saindo…' : 'Sair da conta'}
          </Text>
        </Button>
      </ScrollView>
      <ConfirmDialog
        open={confirmCount != null}
        title="Sair e apagar dados deste aparelho?"
        message={`Há ${confirmCount === 1 ? '1 alteração' : `${confirmCount ?? 0} alterações`} que ainda não foram enviadas ou foram recusadas pelo servidor. Ao sair, elas serão perdidas. Toque em “Aceitar” e aguarde a sincronização para não perder nada.`}
        confirmLabel="Sair mesmo assim"
        cancelLabel="Voltar"
        onCancel={() => answerConfirm(false)}
        onConfirm={() => answerConfirm(true)}
        busy={loggingOut}
        busyLabel="Saindo…"
      />
    </YStack>
  )
}
