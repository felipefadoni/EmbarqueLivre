import Ionicons from '@expo/vector-icons/Ionicons'
import { useQuery } from '@powersync/react'
import { useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { ListStatus } from '@/components/cadastros/ListStatus'
import { AppCard } from '@/components/dashboard/AppCard'
import { CONFLICT_LIST_SQL, type ConflictRow } from '@/sync/localGuard'
import { entityOfTable } from '@/sync/mapping'
import { describeRejection } from '@/sync/rejections'
import { forcePush } from '@/sync/useConflicts'
import type { ForcePushResult } from '@/sync/forcePush'
import { TOQUE_MINIMO } from '../../../../tamagui.config'

function describe(item: ConflictRow) {
  const entity = entityOfTable(item.tableName) ?? item.tableName
  return describeRejection({ entity, op: item.op, opData: item.snapshot ?? item.opData })
}

function summary(results: ForcePushResult[]): string {
  const sent = results.filter((r) => r.outcome === 'sent').length
  const rejected = results.filter((r) => r.outcome === 'rejected').length
  const left = results.filter((r) => r.outcome === 'conflict')
  const linked = results.map((r) => r.linked).filter((l): l is NonNullable<ForcePushResult['linked']> => Boolean(l))
  const parts: string[] = []
  if (sent) parts.push(sent === 1 ? '1 cadastro enviado.' : `${sent} cadastros enviados.`)
  for (const l of linked) {
    parts.push(l.created ? `O ${l.label} "${l.name}" foi criado no servidor.` : `O ${l.label} "${l.name}" passou a usar o do servidor (mesmo nome).`)
  }
  if (rejected) parts.push(rejected === 1 ? '1 foi recusado pelos dados: veja Pendências.' : `${rejected} foram recusados pelos dados: veja Pendências.`)
  if (left.length) parts.push(`${left.length === 1 ? '1 continua' : `${left.length} continuam`} salvo${left.length === 1 ? '' : 's'} só no aparelho: ${left[0].message}`)
  return parts.join(' ') || 'Nada para enviar.'
}

/**
 * Cadastros salvos só neste aparelho: o servidor ainda não aceitou (tipo/vacina de outro ambiente, fazenda que não
 * chegou, permissão…). Ficam guardados e protegidos do download. Enviar o do aparelho SÓ com confirmação: isso
 * sobrescreve no servidor o que estiver diferente.
 */
export default function ConflitosScreen() {
  const isDark = useColorScheme() === 'dark'
  const result = useQuery<ConflictRow>(CONFLICT_LIST_SQL)
  const [confirming, setConfirming] = useState<{ ids: string[]; label: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  async function onConfirm() {
    if (!confirming) return
    setBusy(true)
    setFeedback(null)
    try {
      const results = await forcePush(confirming.ids)
      setFeedback({ ok: results.every((r) => r.outcome === 'sent'), text: summary(results) })
      setConfirming(null)
    } catch (error) {
      setFeedback({ ok: false, text: `Não foi possível enviar agora (${String((error as Error)?.message ?? error)}). Nada foi apagado do aparelho.` })
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

  const button = (label: string, onPress: () => void, primary: boolean, a11y: string) => (
    <XStack
      flex={1}
      minH={TOQUE_MINIMO}
      items="center"
      justify="center"
      px={12}
      rounded={14}
      bg={primary ? 'brandPrimary' : undefined}
      borderWidth={primary ? 0 : 2}
      borderColor="brandBorder"
      opacity={busy ? 0.6 : 1}
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      accessibilityLabel={a11y}>
      <Text fontSize={16} fontWeight="800" color={primary ? 'brandPrimaryFg' : 'brandFg'} text="center">
        {label}
      </Text>
    </XStack>
  )

  return (
    <YStack flex={1} bg="appBg">
      <FlatList
        data={result.data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, flexGrow: 1, gap: 12 }}
        ListHeaderComponent={
          <YStack gap={12} pb={4}>
            <Text fontSize={16} fontWeight="600" color="brandMuted">
              Estes cadastros estão salvos neste aparelho, mas o servidor ainda não aceitou. Eles não serão apagados pela
              sincronização. O app tenta de novo sozinho; para mandar já o que está no aparelho, use Enviar.
            </Text>
            {feedback ? (
              <Text fontSize={16} fontWeight="700" color={feedback.ok ? 'brandFg' : 'brandError'} accessibilityLiveRegion="polite">
                {feedback.text}
              </Text>
            ) : null}
            {result.data.length > 1 ? (
              <XStack>
                {button(
                  `Enviar todos (${result.data.length})`,
                  () => setConfirming({ ids: result.data.map((r) => r.id), label: `os ${result.data.length} cadastros` }),
                  true,
                  'Enviar todos os cadastros salvos só neste aparelho',
                )}
              </XStack>
            ) : null}
          </YStack>
        }
        ListEmptyComponent={
          <ListStatus
            loading={result.isLoading}
            error={result.error ? 'Não foi possível ler os cadastros guardados.' : null}
            empty={!result.isLoading && !result.error}
            emptyTitle="Tudo certo"
            emptyMessage="Nenhum cadastro aguardando confirmação."
            onRetry={() => void result.refresh?.()}
          />
        }
        renderItem={({ item }) => {
          const { title, subtitle } = describe(item)
          return (
            <AppCard>
              <YStack gap={8}>
                <XStack items="center" gap={8}>
                  <Ionicons name="phone-portrait-outline" size={22} color={isDark ? '#99C2AB' : '#2B3D34'} />
                  <Text flex={1} fontSize={18} fontWeight="800" color="brandFg">
                    {title}
                  </Text>
                </XStack>
                <Text fontSize={15} fontWeight="700" color="brandMuted">
                  {subtitle} · salvo neste aparelho
                </Text>
                {item.message ? (
                  <Text fontSize={16} fontWeight="600" color="brandFg">
                    {item.message}
                  </Text>
                ) : null}
                <XStack pt={4}>
                  {button('Enviar o do aparelho', () => setConfirming({ ids: [item.id], label: title }), true, `Enviar ${title} para o servidor`)}
                </XStack>
              </YStack>
            </AppCard>
          )
        }}
      />
      <ConfirmDialog
        open={confirming != null}
        title="Enviar o que está no aparelho?"
        message={`Isso vai sobrescrever no servidor o que estiver diferente com os dados deste aparelho (${confirming?.label ?? ''}). Se o tipo de animal ou a vacina tiver outro código no servidor, o cadastro passa a usar o do servidor com o mesmo nome.`}
        confirmLabel="Enviar e sobrescrever"
        busyLabel="Enviando…"
        tone="primary"
        onCancel={() => setConfirming(null)}
        onConfirm={() => void onConfirm()}
        busy={busy}
      />
    </YStack>
  )
}
