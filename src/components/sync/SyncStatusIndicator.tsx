import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useColorScheme } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { useSyncInfo, type SyncIndicatorState } from '@/sync/hooks'

const LABEL: Record<SyncIndicatorState, string> = {
  online: 'Sincronizado',
  syncing: 'Sincronizando…',
  connecting: 'Conectando…',
  offline: 'Offline',
  unreachable: 'Servidor de sincronização indisponível. Tentando de novo…',
}

export function formatLastSync(date: Date | null): string {
  if (!date) return 'Ainda não sincronizou'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Última sincronização: ${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Indicador de sincronização (online/offline/sincronizando, última sync, fila e pendências). */
export function SyncStatusIndicator({ compact = false }: { compact?: boolean }) {
  const info = useSyncInfo()
  const isDark = useColorScheme() === 'dark'
  const down = info.state === 'offline' || info.state === 'unreachable'
  const color =
    info.state === 'online' ? (isDark ? '#7FD1A0' : '#1F7A45') : down ? (isDark ? '#F0C36B' : '#8A5A00') : isDark ? '#A8B8AF' : '#3A5247'
  const icon = info.state === 'online' ? 'cloud-done-outline' : down ? 'cloud-offline-outline' : 'cloud-upload-outline'
  const waiting = info.pendingUploads
  const hasRejections = info.rejectionCount > 0

  const summary = [
    LABEL[info.state],
    waiting > 0 ? `${waiting} ${waiting === 1 ? 'alteração aguardando envio' : 'alterações aguardando envio'}` : null,
    info.pendingPhotos > 0 ? `${info.pendingPhotos} ${info.pendingPhotos === 1 ? 'foto aguardando envio' : 'fotos aguardando envio'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <YStack gap={6} accessibilityRole="summary" accessibilityLabel={`${summary}. ${formatLastSync(info.lastSyncedAt)}`}>
      <XStack items="center" gap={8}>
        {info.state === 'syncing' || info.state === 'connecting' ? <Spinner size="small" color="brandPrimary" /> : <Ionicons name={icon} size={20} color={color} />}
        <Text fontSize={16} fontWeight="800" color="brandFg" flex={1}>
          {summary}
        </Text>
      </XStack>
      {compact ? null : (
        <Text fontSize={14} fontWeight="600" color="brandMuted">
          {formatLastSync(info.lastSyncedAt)}
        </Text>
      )}
      {!compact && (info.pendingUploads > 0 || info.pendingPhotos > 0) ? (
        <Text fontSize={14} fontWeight="600" color="brandMuted">
          {info.networkOnline
            ? 'Enviando automaticamente. Pode deixar o app em segundo plano.'
            : 'Sem internet: envia sozinho quando a rede voltar (Wi‑Fi ou dados móveis).'}
        </Text>
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
    </YStack>
  )
}
