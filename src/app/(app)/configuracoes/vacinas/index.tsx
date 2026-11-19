import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import type { Account } from '@/api/accounts'
import type { Vaccine } from '@/api/catalog'
import { AccountPicker } from '@/components/cadastros/AccountPicker'
import { AuthorLines } from '@/components/cadastros/AuthorLines'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { TextFilterField } from '@/components/cadastros/TextFilterField'
import { AppCard } from '@/components/dashboard/AppCard'
import { canFilterByAuthorEmail, canSeeAuthor, canUseAdminFilters, summarizeVaccineFilters, type AuthorValue } from '@/features/cadastros/farmFilters'
import { canViewVaccines } from '@/features/cadastros/permissions'
import { vaccineAccess } from '@/features/cadastros/vaccineAccess'
import { useAuth } from '@/features/auth/AuthProvider'
import { useKeysetList } from '@/sync/hooks'
import { vaccinesListSpec, rowToVaccine } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

function carenciaLabel(days: number) {
  return days === 1 ? '1 dia de carência' : `${days} dias de carência`
}

export default function VacinasListScreen() {
  const { user } = useAuth()
  if (!canViewVaccines(user?.role)) return <Redirect href="/configuracoes" />
  // Admin: autor (AuthorLines) + filtro pelo e-mail de quem cadastrou. Master: a lista de antes (sem join, sem filtro).
  if (canUseAdminFilters(user?.role))
    return <VacinasAdminList showAuthor={canSeeAuthor(user?.role, 'vaccines')} showAuthorEmail={canFilterByAuthorEmail(user?.role, 'vaccines')} />
  return <VacinasList />
}

function VacinasAdminList({ showAuthor, showAuthorEmail }: { showAuthor: boolean; showAuthorEmail: boolean }) {
  const isDark = useColorScheme() === 'dark'
  const { user } = useAuth()
  const access = vaccineAccess(user?.role)
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const [authorEmail, setAuthorEmail] = useState('')
  // Vacinas por conta (§25): admin filtra pela conta. A escolha da conta é online (GET /accounts, o sync não traz o
  // nome da conta); o filtro em si é local (coluna account_id), então continua valendo offline.
  const allAccounts = access.scope === 'all-accounts'
  const [account, setAccount] = useState<Account | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const summary = useMemo(() => {
    const base = summarizeVaccineFilters({ authorEmail })
    if (!account) return base
    const text = base.activeCount ? `Conta: ${account.name} · ${base.text}` : `Conta: ${account.name}`
    return { text, activeCount: base.activeCount + 1 }
  }, [authorEmail, account])
  const showFilters = showAuthorEmail || allAccounts
  // Scroll infinito com keyset (nome + id), offline; o autor só entra na consulta do admin.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(
    () =>
      vaccinesListSpec({
        withAuthor: showAuthor,
        authorEmail: showAuthorEmail ? authorEmail : undefined,
        accountId: allAccounts ? account?.id : undefined,
      }),
    rowToVaccine,
    [showAuthor, showAuthorEmail, authorEmail, allAccounts, account?.id],
  )

  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
  }

  return (
    <YStack flex={1} bg="appBg">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.name}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1, gap: 12 }}
        ListHeaderComponent={
          <YStack pt={12} pb={8} gap={12}>
            <XStack items="center" gap={12}>
              {access.canCreate ? (
                <XStack
                  flex={1}
                  minH={TOQUE_MINIMO}
                  items="center"
                  justify="center"
                  rounded={16}
                  bg="brandPrimary"
                  opacity={{ press: 0.85 }}
                  onPress={() => router.push('/configuracoes/vacinas/nova')}
                  accessibilityRole="button"
                  accessibilityLabel="Novo medicamento">
                  <Text fontSize={16} fontWeight="800" color="brandPrimaryFg">
                    Novo medicamento
                  </Text>
                </XStack>
              ) : (
                <Text flex={1} fontSize={16} fontWeight="600" color="brandMuted">
                  Somente consulta.
                </Text>
              )}
              {showFilters ? <FilterToggle open={filtersOpen} activeCount={summary.activeCount} onPress={() => toggleFilters()} /> : null}
            </XStack>
            {showFilters ? (
              <CollapsibleFilters
                open={filtersOpen}
                summary={summary.text}
                onOpen={() => toggleFilters(true)}
                onClear={() => {
                  setAuthorEmail('')
                  setAccount(null)
                }}
                clearable={summary.activeCount > 0}>
                {allAccounts ? (
                  <AccountPicker label="Conta" value={account?.id ?? ''} selected={account} placeholder="Todas as contas" onChange={setAccount} />
                ) : null}
                {showAuthorEmail ? (
                  <TextFilterField
                    label="E-mail de quem cadastrou"
                    value={authorEmail}
                    placeholder="Buscar pelo e-mail"
                    keyboardType="email-address"
                    onChange={setAuthorEmail}
                  />
                ) : null}
              </CollapsibleFilters>
            ) : null}
          </YStack>
        }
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => {
          if (hasMore && !loading && !refreshing && !loadingMore) void loadMore()
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ListLoadingFooter /> : undefined}
        ListEmptyComponent={
          <ListStatus
            loading={loading}
            error={error}
            empty={!loading && !error}
            emptyTitle="Nenhum medicamento"
            emptyMessage={
              summary.activeCount > 0 ? 'Nenhum medicamento com esse filtro.' : access.canCreate ? 'Cadastre o primeiro medicamento e os dias de carência.' : 'Ainda não há medicamentos cadastrados.'
            }
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => (
          <VaccineRow
            vaccine={item}
            chevron={chevron}
            canOpen
            canEdit={access.canEdit}
            author={showAuthor ? { name: item.createdByName, email: item.createdByEmail } : undefined}
          />
        )}
      />
    </YStack>
  )
}

function VacinasList() {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const { user } = useAuth()
  const access = vaccineAccess(user?.role)
  const canManage = access.canCreate
  // Lista local reativa (PowerSync): funciona offline e atualiza sozinha quando o sync traz dados.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(() => vaccinesListSpec(), rowToVaccine, [])

  return (
    <YStack flex={1} bg="appBg">
      {canManage ? (
      <YStack px={20} pt={12} pb={8}>
        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          rounded={16}
          bg="brandPrimary"
          opacity={{ press: 0.85 }}
          onPress={() => router.push('/configuracoes/vacinas/nova')}
          accessibilityRole="button"
          accessibilityLabel="Novo medicamento">
          <Text fontSize={16} fontWeight="800" color="brandPrimaryFg">
            Novo medicamento
          </Text>
        </XStack>
      </YStack>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.name}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1, gap: 12 }}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => {
          if (hasMore && !loading && !refreshing && !loadingMore) void loadMore()
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ListLoadingFooter /> : undefined}
        ListEmptyComponent={
          <ListStatus
            loading={loading}
            error={error}
            empty={!loading && !error}
            emptyTitle="Nenhum medicamento"
            emptyMessage={canManage ? 'Cadastre o primeiro medicamento e os dias de carência.' : 'Ainda não há medicamentos cadastrados.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => <VaccineRow vaccine={item} chevron={chevron} canOpen={access.canView} canEdit={access.canEdit} />}
      />
    </YStack>
  )
}

function VaccineRow({
  vaccine,
  chevron,
  canOpen,
  canEdit,
  author,
}: {
  vaccine: Vaccine
  chevron: string
  /** Abre o cadastro (editar ou, sem permissão de alterar, só ver). */
  canOpen: boolean
  canEdit: boolean
  /** Só admin: autor da vacina (undefined = não mostrar). */
  author?: AuthorValue | null
}) {
  return (
    <AppCard padded={false}>
      <XStack
        items="center"
        justify="space-between"
        px={20}
        py={16}
        minH={TOQUE_MINIMO}
        gap={12}
        opacity={canOpen ? { press: 0.85 } : undefined}
        onPress={canOpen ? () => router.push(`/configuracoes/vacinas/${vaccine.id}`) : undefined}
        accessibilityRole={canOpen ? 'button' : undefined}
        accessibilityLabel={canOpen ? `${canEdit ? 'Editar' : 'Ver'} medicamento ${vaccine.name}` : vaccine.name}>
        <YStack flex={1} gap={4}>
          <Text fontSize={16} fontWeight="800" color="brandFg">
            {vaccine.name}
          </Text>
          <Text fontSize={16} fontWeight="500" color="brandMuted">
            {carenciaLabel(vaccine.withdrawalDays)}
          </Text>
          {author !== undefined ? <AuthorLines author={author} /> : null}
        </YStack>
        {canOpen ? <Ionicons name="chevron-forward" size={20} color={chevron} /> : null}
      </XStack>
    </AppCard>
  )
}
