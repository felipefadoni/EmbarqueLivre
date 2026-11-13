import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import type { Farm } from '@/api/catalog'
import { AppCard } from '@/components/dashboard/AppCard'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { TextFilterField } from '@/components/cadastros/TextFilterField'
import { labelUf } from '@/constants/ufs'
import { AuthorLines } from '@/components/cadastros/AuthorLines'
import { canFilterByAuthorEmail, canSeeAuthor, canUseAdminFilters, summarizeFarmFilters, type AuthorValue } from '@/features/cadastros/farmFilters'
import { canManageFarms } from '@/features/cadastros/permissions'
import { matchingFarmIds } from '@/features/cadastros/textFilter'
import { useAuth } from '@/features/auth/AuthProvider'
import { useKeysetList, useLocalFarms } from '@/sync/hooks'
import { farmsListSpec, rowToFarm, type FarmRow as LocalFarmRow } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

export default function FazendasListScreen() {
  const { user } = useAuth()
  if (!canManageFarms(user?.role)) return <Redirect href="/configuracoes" />
  // Admin: filtros (nome; e-mail de quem cadastrou quando o contrato existir). Master: lista inalterada.
  if (canUseAdminFilters(user?.role))
    return <FazendasAdminList showAuthor={canSeeAuthor(user?.role, 'farms')} showAuthorEmail={canFilterByAuthorEmail(user?.role, 'farms')} />
  return <FazendasList />
}

function FazendasAdminList({ showAuthor, showAuthorEmail }: { showAuthor: boolean; showAuthorEmail: boolean }) {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const [farmName, setFarmName] = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Todas as fazendas do aparelho (já usadas nos selects): o nome é comparado sem acentos no JS.
  const allFarms = useLocalFarms()
  const ids = useMemo(() => matchingFarmIds(allFarms, farmName), [allFarms, farmName])
  const summary = useMemo(() => summarizeFarmFilters({ farmName, authorEmail }), [farmName, authorEmail])
  // Scroll infinito com keyset (nome + id); o autor só entra na consulta do admin.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(
    () => farmsListSpec({ ids, withAuthor: showAuthor, authorEmail: showAuthorEmail ? authorEmail : undefined }),
    (row: LocalFarmRow) => rowToFarm(row),
    [ids, showAuthor, showAuthorEmail, authorEmail],
  )

  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
  }

  function clearFilters() {
    setFarmName('')
    setAuthorEmail('')
  }

  return (
    <YStack flex={1} bg="appBg">
      <YStack px={20} pt={12} pb={8} gap={12}>
        <XStack items="center" gap={12}>
          <XStack
            flex={1}
            minH={TOQUE_MINIMO}
            items="center"
            justify="center"
            rounded={16}
            bg="brandPrimary"
            opacity={{ press: 0.85 }}
            onPress={() => router.push('/configuracoes/fazendas/nova')}
            accessibilityRole="button"
            accessibilityLabel="Nova fazenda">
            <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
              Nova fazenda
            </Text>
          </XStack>
          <FilterToggle open={filtersOpen} activeCount={summary.activeCount} onPress={() => toggleFilters()} />
        </XStack>
        <CollapsibleFilters
          open={filtersOpen}
          summary={summary.text}
          onOpen={() => toggleFilters(true)}
          onClear={clearFilters}
          clearable={summary.activeCount > 0}>
          <TextFilterField label="Nome da fazenda" value={farmName} placeholder="Buscar pelo nome" onChange={setFarmName} />
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
      </YStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.name}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1, gap: 12 }}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => {
          if (hasMore && !loading && !refreshing && !loadingMore) loadMore()
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ListLoadingFooter /> : undefined}
        ListEmptyComponent={
          <ListStatus
            loading={loading}
            error={error}
            empty={!loading && !error}
            emptyTitle="Nenhuma fazenda"
            emptyMessage={summary.activeCount > 0 ? 'Nenhuma fazenda com esses filtros.' : 'Cadastre a primeira fazenda para começar.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => (
          <FarmRow farm={item} chevron={chevron} canManage author={showAuthor ? { name: item.createdByName, email: item.createdByEmail } : undefined} />
        )}
      />
    </YStack>
  )
}

function FazendasList() {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const { user } = useAuth()
  const canManage = canManageFarms(user?.role)
  // Lista local reativa (PowerSync): funciona offline e atualiza sozinha quando o sync traz dados.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(() => farmsListSpec(), (row: LocalFarmRow) => rowToFarm(row), [])

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
          onPress={() => router.push('/configuracoes/fazendas/nova')}
          accessibilityRole="button"
          accessibilityLabel="Nova fazenda">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Nova fazenda
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
            emptyTitle="Nenhuma fazenda"
            emptyMessage={canManage ? 'Cadastre a primeira fazenda para começar.' : 'Ainda não há fazendas cadastradas.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => <FarmRow farm={item} chevron={chevron} canManage={canManage} />}
      />
    </YStack>
  )
}

function FarmRow({ farm, chevron, canManage, author }: { farm: Farm; chevron: string; canManage: boolean; author?: AuthorValue | null }) {
  return (
    <AppCard padded={false}>
      <XStack
        items="center"
        justify="space-between"
        px={20}
        py={16}
        minH={TOQUE_MINIMO}
        gap={12}
        opacity={canManage ? { press: 0.85 } : undefined}
        onPress={canManage ? () => router.push(`/configuracoes/fazendas/${farm.id}`) : undefined}
        accessibilityRole={canManage ? 'button' : undefined}
        accessibilityLabel={canManage ? `Editar fazenda ${farm.name}` : farm.name}>
        <YStack flex={1} gap={4}>
          <Text fontSize={18} fontWeight="800" color="brandFg">
            {farm.name}
          </Text>
          <Text fontSize={16} fontWeight="500" color="brandMuted">
            {farm.city} · {labelUf(farm.state)}
          </Text>
          {/* Só admin: e-mail de quem cadastrou, ou "Autor não registrado" (src/api/authorContract.ts). */}
          {author !== undefined ? <AuthorLines author={author} /> : null}
        </YStack>
        {canManage ? <Ionicons name="chevron-forward" size={22} color={chevron} /> : null}
      </XStack>
    </AppCard>
  )
}
