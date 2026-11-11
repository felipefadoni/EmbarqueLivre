import Ionicons from '@expo/vector-icons/Ionicons'
import { useQuery } from '@powersync/react'
import { router, type Href } from 'expo-router'
import { useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { ListStatus } from '@/components/cadastros/ListStatus'
import { AppCard } from '@/components/dashboard/AppCard'
import { db } from '@/sync'
import { isFixableRejection } from '@/sync/outbox'
import { entityOfTable, tableOf, type SyncEntity } from '@/sync/mapping'
import {
  correctionTarget,
  describeRejection,
  discardRejectionGroup,
  ENTITY_ROUTES,
  groupRejections,
  REJECTIONS_LIST_SQL,
  shipmentIdForLinkRejection,
  type Rejection,
  type RejectionGroup,
} from '@/sync/rejections'
import { TOQUE_MINIMO } from '../../../../tamagui.config'

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} às ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Pendências: SÓ operações que a API recusou por causa do dado (validação, duplicado, regra). Cadastro ainda não
 * enviado (sem rede, servidor fora, 5xx, timeout…) nunca aparece aqui: fica na fila e sobe sozinho.
 * - Corrigir: abre o formulário com os valores recusados; salvar gera uma nova operação.
 * - Descartar: apaga o aviso; a linha local já voltou (ou volta no próximo checkpoint) ao estado do servidor.
 */
export default function PendenciasScreen() {
  const isDark = useColorScheme() === 'dark'
  const result = useQuery<Rejection>(REJECTIONS_LIST_SQL)
  const groups = groupRejections(result.data)
  const [discarding, setDiscarding] = useState<RejectionGroup | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCorrect(rejection: Rejection) {
    setError(null)
    const entity = (entityOfTable(rejection.tableName) ?? rejection.entity) as SyncEntity
    if (entity === 'shipmentAnimals') {
      // Vínculo embarque ↔ animal: corrige-se na análise do embarque (seleção de animais).
      const shipmentId = await shipmentIdForLinkRejection(db, rejection)
      const exists = shipmentId ? Boolean(await db.getOptional(`SELECT id FROM ${tableOf('shipments')} WHERE id = ?`, [shipmentId])) : false
      router.push(
        (exists
          ? { pathname: ENTITY_ROUTES.shipments.edit, params: { id: shipmentId, pendencia: rejection.id } }
          : ENTITY_ROUTES.shipments.list) as Href,
      )
      return
    }
    const routes = ENTITY_ROUTES[entity as keyof typeof ENTITY_ROUTES]
    if (!routes) return
    const exists = Boolean(await db.getOptional(`SELECT id FROM ${tableOf(entity)} WHERE id = ?`, [rejection.rowId]))
    const target = correctionTarget(rejection, exists)
    const href = (
      target === 'edit'
        ? { pathname: routes.edit, params: { id: rejection.rowId, pendencia: rejection.id } }
        : { pathname: routes.create, params: { pendencia: rejection.id } }
    ) as Href
    router.push(href)
  }

  async function onDiscard() {
    if (!discarding) return
    setBusy(true)
    try {
      await discardRejectionGroup(db, discarding)
      setDiscarding(null)
    } catch {
      setError('Não foi possível descartar a pendência. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack flex={1} bg="appBg">
      <FlatList
        data={groups}
        keyExtractor={(item) => item.primary.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, flexGrow: 1, gap: 12 }}
        ListHeaderComponent={
          <YStack gap={12} pb={4}>
            <Text fontSize={16} fontWeight="600" color="brandMuted">
              Alterações que o servidor recusou por causa dos dados. O que ainda não foi enviado não aparece aqui: é enviado
              sozinho quando houver internet.
            </Text>
            {error ? (
              <Text fontSize={16} fontWeight="700" color="brandError" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
          </YStack>
        }
        ListEmptyComponent={
          <ListStatus
            loading={result.isLoading}
            error={result.error ? 'Não foi possível ler as pendências.' : null}
            empty={!result.isLoading && !result.error}
            emptyTitle="Nenhuma pendência"
            emptyMessage="Nenhuma alteração foi recusada pelo servidor."
            onRetry={() => void result.refresh?.()}
          />
        }
        renderItem={({ item }) => {
          const { title, subtitle } = describeRejection(item.primary)
          // Corrigir só para recusa de dado (400/409/422). Outras recusas definitivas (ex.: permissão): só Descartar.
          const fixable = isFixableRejection(item.primary)
          return (
            <AppCard>
              <YStack gap={8}>
                <XStack items="center" gap={8}>
                  <Ionicons name="alert-circle" size={22} color={isDark ? '#FF8A80' : '#B3261E'} />
                  <Text flex={1} fontSize={18} fontWeight="800" color="brandFg">
                    {title}
                  </Text>
                </XStack>
                <Text fontSize={15} fontWeight="700" color="brandMuted">
                  {subtitle} · {formatDateTime(item.primary.createdAt)}
                </Text>
                <Text fontSize={16} fontWeight="600" color="brandFg">
                  {item.primary.message}
                </Text>
                {item.dependentsLabel ? (
                  <Text fontSize={15} fontWeight="700" color="brandMuted">
                    {item.dependentsLabel}
                  </Text>
                ) : null}
                {fixable ? null : (
                  <Text fontSize={15} fontWeight="600" color="brandMuted">
                    Não há o que corrigir no cadastro: descarte para voltar ao que está no servidor.
                  </Text>
                )}
                <XStack gap={12} pt={4}>
                  {fixable ? (
                    <XStack
                      flex={1}
                      minH={TOQUE_MINIMO}
                      items="center"
                      justify="center"
                      rounded={14}
                      bg="brandPrimary"
                      opacity={{ press: 0.85 }}
                      onPress={() => void onCorrect(item.primary)}
                      accessibilityRole="button"
                      accessibilityLabel={`Corrigir ${title}`}>
                      <Text fontSize={17} fontWeight="800" color="brandPrimaryFg">
                        Corrigir
                      </Text>
                    </XStack>
                  ) : null}
                  <XStack
                    flex={1}
                    minH={TOQUE_MINIMO}
                    items="center"
                    justify="center"
                    rounded={14}
                    borderWidth={2}
                    borderColor="brandBorder"
                    opacity={{ press: 0.85 }}
                    onPress={() => setDiscarding(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Descartar ${title}`}>
                    <Text fontSize={17} fontWeight="800" color="brandFg">
                      Descartar
                    </Text>
                  </XStack>
                </XStack>
              </YStack>
            </AppCard>
          )
        }}
      />
      <ConfirmDialog
        open={discarding != null}
        title="Descartar esta alteração?"
        message={
          discarding?.dependents.length
            ? `${discarding.dependentsLabel}. ${(entityOfTable(discarding.primary.tableName) ?? discarding.primary.entity) === 'shipments' ? 'O embarque' : 'O rebanho'} e esses vínculos voltam a ficar como estão no servidor. Esta ação não pode ser desfeita.`
            : 'O registro volta a ficar como está no servidor. Esta ação não pode ser desfeita.'
        }
        confirmLabel="Descartar"
        onCancel={() => setDiscarding(null)}
        onConfirm={() => void onDiscard()}
        busy={busy}
      />
    </YStack>
  )
}
