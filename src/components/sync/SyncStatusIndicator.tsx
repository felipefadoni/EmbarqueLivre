import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useSyncExternalStore } from 'react'
import { Alert, useColorScheme } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { connector } from '@/sync'
import { useSyncInfo, type SyncIndicatorState } from '@/sync/hooks'
import { describeSdkUploadError, useUploadPump } from '@/sync/useUploadPump'
import { TOQUE_MINIMO } from '../../../tamagui.config'

const LABEL: Record<SyncIndicatorState, string> = {
  online: 'Sincronizado',
  syncing: 'Sincronizando…',
  connecting: 'Conectando…',
  offline: 'Offline',
  unreachable: 'Servidor de sincronização indisponível. Tentando de novo…',
  disconnected: 'Sem conexão com o servidor de sincronização',
}

export function formatLastSync(date: Date | null): string {
  if (!date) return 'Ainda não sincronizou'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Última sincronização: ${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Indicador de sincronização (online/offline/sincronizando, última sync, fila e pendências).
 * Com algo aguardando envio: mostra o motivo da última falha (envio direto ou SDK) e o botão "Enviar agora", que
 * tenta já e informa o resultado (alerta) — falha de envio nunca fica muda.
 */
export function SyncStatusIndicator({ compact = false }: { compact?: boolean }) {
  const info = useSyncInfo()
  const pump = useUploadPump()
  const envMismatch = useSyncExternalStore(connector.subscribeMismatch, connector.getMismatch, connector.getMismatch)
  const isDark = useColorScheme() === 'dark'
  const waiting = info.pendingUploads
  const hasQueue = waiting > 0 || info.pendingPhotos > 0
  // Conectado mas com fila: não diz "Sincronizado".
  const label = envMismatch && info.state !== 'offline' ? 'Sincronização pausada' : info.state === 'online' && waiting > 0 ? 'Conectado' : LABEL[info.state]
  const down = info.state === 'offline' || info.state === 'unreachable' || info.state === 'disconnected'
  const color =
    info.state === 'online' ? (isDark ? '#7FD1A0' : '#1F7A45') : down ? (isDark ? '#F0C36B' : '#8A5A00') : isDark ? '#A8B8AF' : '#3A5247'
  const icon = info.state === 'online' ? 'cloud-done-outline' : down ? 'cloud-offline-outline' : 'cloud-upload-outline'
  const hasRejections = info.rejectionCount > 0
  // Motivo da falha: o do envio direto (mais recente/preciso) ou o do SDK.
  // PowerSync de outro ambiente que a API: a sync fica pausada de propósito (não apagar dados); avisa sempre.
  const mismatchMessage =
    envMismatch ??
    ((info.downloadError as { name?: string } | null)?.name === 'PowerSyncEnvironmentMismatchError' ? String((info.downloadError as Error).message) : null)
  const problem = hasQueue ? (pump.problem ?? describeSdkUploadError(info.uploadError)) : null

  const summary = [
    label,
    waiting > 0 ? `${waiting} ${waiting === 1 ? 'alteração aguardando envio' : 'alterações aguardando envio'}` : null,
    info.pendingPhotos > 0 ? `${info.pendingPhotos} ${info.pendingPhotos === 1 ? 'foto aguardando envio' : 'fotos aguardando envio'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  async function onSendNow() {
    const result = await pump.sendNow()
    if (result.outcome === 'failed' || result.outcome === 'offline') {
      Alert.alert('Não foi possível enviar', result.message)
    } else if (result.outcome === 'partial') {
      Alert.alert('Envio em andamento', result.message)
    }
  }

  return (
    <YStack gap={6} accessibilityRole="summary" accessibilityLabel={`${summary}. ${formatLastSync(info.lastSyncedAt)}`}>
      <XStack items="center" gap={8}>
        {info.state === 'syncing' || info.state === 'connecting' || pump.running ? (
          <Spinner size="small" color="brandPrimary" />
        ) : (
          <Ionicons name={icon} size={20} color={color} />
        )}
        <Text fontSize={16} fontWeight="800" color="brandFg" flex={1}>
          {summary}
        </Text>
      </XStack>
      {compact ? null : (
        <Text fontSize={14} fontWeight="600" color="brandMuted">
          {formatLastSync(info.lastSyncedAt)}
        </Text>
      )}
      {mismatchMessage ? (
        <XStack gap={6} items="flex-start" accessibilityLiveRegion="polite">
          <Ionicons name="pause-circle-outline" size={18} color={isDark ? '#F0C36B' : '#8A5A00'} style={{ marginTop: 1 }} />
          <Text flex={1} fontSize={14} fontWeight="700" color="brandFg" numberOfLines={compact ? 3 : undefined}>
            {mismatchMessage}
          </Text>
        </XStack>
      ) : null}
      {problem ? (
        <XStack gap={6} items="flex-start" accessibilityLiveRegion="polite">
          <Ionicons name="warning-outline" size={18} color={isDark ? '#FF8A80' : '#B3261E'} style={{ marginTop: 1 }} />
          <Text flex={1} fontSize={14} fontWeight="700" color="brandError" numberOfLines={compact ? 2 : undefined}>
            Envio falhou: {problem.message}
          </Text>
        </XStack>
      ) : null}
      {!compact && hasQueue && !problem ? (
        <Text fontSize={14} fontWeight="600" color="brandMuted">
          {info.networkOnline
            ? 'Enviando automaticamente. Pode deixar o app em segundo plano.'
            : 'Sem internet: envia sozinho quando a rede voltar (Wi‑Fi ou dados móveis).'}
        </Text>
      ) : null}
      {!compact && hasQueue && !pump.running && pump.lastResult?.outcome === 'partial' ? (
        <Text fontSize={14} fontWeight="600" color="brandMuted">
          {pump.lastResult.message}
        </Text>
      ) : null}
      {!compact && waiting > 0 ? (
        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          gap={8}
          rounded={14}
          borderWidth={2}
          borderColor="brandBorder"
          opacity={pump.running ? 0.6 : 1}
          onPress={pump.running ? undefined : () => void onSendNow()}
          accessibilityRole="button"
          accessibilityState={{ busy: pump.running, disabled: pump.running }}
          accessibilityLabel="Enviar agora as alterações aguardando envio">
          {pump.running ? <Spinner size="small" color="brandPrimary" /> : <Ionicons name="cloud-upload-outline" size={20} color={isDark ? '#E8F1EC' : '#1D2B24'} />}
          <Text fontSize={16} fontWeight="800" color="brandFg">
            {pump.running ? 'Enviando…' : 'Enviar agora'}
          </Text>
        </XStack>
      ) : null}
      {!compact && info.failedPhotos > 0 ? (
        <Text fontSize={14} fontWeight="700" color="brandError">
          {info.failedPhotos === 1 ? '1 foto não foi aceita pelo servidor' : `${info.failedPhotos} fotos não foram aceitas pelo servidor`}: abra o embarque e use “Reenviar foto” ou tire outra.
        </Text>
      ) : null}
      {hasRejections ? (
        <XStack
          minH={44}
          items="center"
          gap={8}
          onPress={() => router.push('/configuracoes/pendencias')}
          accessibilityRole="button"
          accessibilityLabel={`${info.rejectionCount} pendências recusadas pelo servidor. Abrir pendências`}>
          <Ionicons name="alert-circle" size={20} color={isDark ? '#FF8A80' : '#B3261E'} />
          <Text fontSize={15} fontWeight="800" color="brandError" textDecorationLine="underline">
            {info.rejectionCount === 1 ? '1 pendência para revisar' : `${info.rejectionCount} pendências para revisar`}
          </Text>
        </XStack>
      ) : null}
      {info.conflictCount > 0 ? (
        <XStack
          minH={44}
          items="center"
          gap={8}
          onPress={() => router.push('/configuracoes/conflitos')}
          accessibilityRole="button"
          accessibilityLabel={`${info.conflictCount} cadastros salvos só neste aparelho. Abrir para enviar`}>
          <Ionicons name="phone-portrait-outline" size={20} color={isDark ? '#99C2AB' : '#2B3D34'} />
          <Text flex={1} fontSize={15} fontWeight="800" color="brandFg" textDecorationLine="underline">
            {info.conflictCount === 1
              ? '1 cadastro salvo só neste aparelho: toque para enviar'
              : `${info.conflictCount} cadastros salvos só neste aparelho: toque para enviar`}
          </Text>
        </XStack>
      ) : null}
    </YStack>
  )
}
