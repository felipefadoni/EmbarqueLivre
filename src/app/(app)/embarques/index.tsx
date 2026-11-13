import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Input, Text, XStack, YStack } from 'tamagui'

import { formatWeightKg, SHIPMENTS_CONTRACT, todayIsoInShipmentZone, type ShipmentStatus } from '@/api/shipmentsContract'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { SelectField } from '@/components/cadastros/SelectField'
import { TextFilterField } from '@/components/cadastros/TextFilterField'
import { AppCard } from '@/components/dashboard/AppCard'
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatDatePtBr } from '@/features/cadastros/dates'
import { AuthorLines } from '@/components/cadastros/AuthorLines'
import { canFilterByAuthorEmail, canSeeAuthor } from '@/features/cadastros/farmFilters'
import { canManageShipments } from '@/features/cadastros/permissions'
import { SHIPMENT_WHEN_LABEL, summarizeShipmentFilters } from '@/features/cadastros/shipmentFilters'
import { animalsCountLabel, SHIPMENT_TABS } from '@/features/embarques/shipmentFlow'
import { ShipmentStatusBadge } from '@/features/embarques/ShipmentStatusBadge'
import { useLocalFarms, useKeysetList } from '@/sync/hooks'
import { isShipmentWhen, rowToShipment, shipmentsListSpec, type ShipmentRow, type ShipmentWhen } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../../tamagui.config'

/** Aba Embarques: lista com abas Em andamento / Finalizado e o botão Novo embarque. */
export default function EmbarquesListScreen() {
  const { user } = useAuth()
  if (!canManageShipments(user?.role)) return <Redirect href="/" />
  // Só admin: autor e filtro pelo e-mail de quem cadastrou. Master/básico: lista inalterada.
  return <EmbarquesList showAuthor={canSeeAuthor(user?.role, 'shipments')} showAuthorEmail={canFilterByAuthorEmail(user?.role, 'shipments')} />
}

function EmbarquesList({ showAuthor, showAuthorEmail }: { showAuthor: boolean; showAuthorEmail: boolean }) {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const farms = useLocalFarms()
  const [farmId, setFarmId] = useState('')
  const [when, setWhen] = useState<ShipmentWhen | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [status, setStatus] = useState<ShipmentStatus>('in_progress')
  const [authorEmail, setAuthorEmail] = useState('')
  const authorFilter = showAuthorEmail ? authorEmail : undefined
  const today = todayIsoInShipmentZone()

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SHIPMENTS_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(
    // Keyset: mesma ordem de antes (dia do embarque, nome, id); ver shipmentsListSpec.
    () =>
      shipmentsListSpec({
        farmId: farmId || undefined,
        search: search || undefined,
        when: when || undefined,
        today,
        status,
        withAuthor: showAuthor,
        authorEmail: authorFilter,
      }),
    (row: ShipmentRow) => rowToShipment(row),
    [farmId, search, when, today, status, showAuthor, authorFilter],
  )

  const farmName = farmId ? farms.find((farm) => farm.id === farmId)?.name : undefined
  const filterSummary = useMemo(
    () => summarizeShipmentFilters({ farmName, when, search: searchInput, authorEmail: authorFilter }),
    [farmName, when, searchInput, authorFilter],
  )
  const hasFilters = filterSummary.activeCount > 0

  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
  }

  function clearFilters() {
    setFarmId('')
    setWhen('')
    setSearchInput('')
    setSearch('')
    setAuthorEmail('')
  }

  return (
    <YStack flex={1} bg="appBg">
      <YStack px={20} pt={12} pb={8} gap={12}>
        <SyncStatusIndicator compact />
        <XStack bg="brandSurface" rounded={18} p={4} gap={4} accessibilityRole="tablist">
          {SHIPMENT_TABS.map((tab) => {
            const selected = tab.value === status
            return (
              <XStack
                key={tab.value}
                flex={1}
                minH={TOQUE_MINIMO}
                items="center"
                justify="center"
                rounded={14}
                bg={selected ? 'cardBg' : 'transparent'}
                opacity={{ press: 0.85 }}
                onPress={() => setStatus(tab.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`Embarques ${tab.label}`}>
                <Text fontSize={16} fontWeight={selected ? '800' : '600'} color={selected ? 'brandFg' : 'brandMuted'} numberOfLines={1}>
                  {tab.label}
                </Text>
              </XStack>
            )
          })}
        </XStack>
        <XStack items="center" gap={12}>
          <XStack
            flex={1}
            minH={TOQUE_MINIMO}
            items="center"
            justify="center"
            rounded={16}
            bg="brandPrimary"
            opacity={{ press: 0.85 }}
            onPress={() => router.push('/embarques/nova')}
            accessibilityRole="button"
            accessibilityLabel="Novo embarque">
            <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
              Novo embarque
            </Text>
          </XStack>
          <FilterToggle open={filtersOpen} activeCount={filterSummary.activeCount} onPress={() => toggleFilters()} />
        </XStack>
        <CollapsibleFilters
          open={filtersOpen}
          summary={filterSummary.text}
          onOpen={() => toggleFilters(true)}
          onClear={clearFilters}
          clearable={hasFilters}>
          <SelectField
            label="Fazenda"
            value={farmId}
            options={[{ value: '', label: 'Todas as fazendas' }, ...farms.map((farm) => ({ value: farm.id, label: farm.name }))]}
            onChange={setFarmId}
          />
          <SelectField
            label="Período"
            value={when}
            options={[
              { value: '', label: 'Todos' },
              { value: 'proximos', label: SHIPMENT_WHEN_LABEL.proximos },
              { value: 'realizados', label: SHIPMENT_WHEN_LABEL.realizados },
            ]}
            onChange={(value) => setWhen(isShipmentWhen(value) ? value : '')}
          />
          <XStack
            minH={TOQUE_MINIMO}
            items="center"
            bg="brandSurface"
            borderColor="brandBorder"
            borderWidth={2}
            rounded={16}
            px="3"
            gap={8}>
            <Ionicons name="search" size={20} color={iconColor} />
            <Input
              flex={1}
              h="100%"
              fontSize={18}
              fontWeight="600"
              color="brandFg"
              bg="transparent"
              borderWidth={0}
              placeholder="Buscar pelo nome"
              placeholderTextColor="brandMuted"
              value={searchInput}
              onChangeText={setSearchInput}
              autoCapitalize="sentences"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Buscar embarque pelo nome"
            />
            {searchInput ? (
              <XStack
                minH={TOQUE_MINIMO}
                items="center"
                justify="center"
                style={{ width: 44 }}
                onPress={() => setSearchInput('')}
                accessibilityRole="button"
                accessibilityLabel="Limpar busca">
                <Ionicons name="close-circle" size={22} color={iconColor} />
              </XStack>
            ) : null}
          </XStack>
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
        keyExtractor={(item) => item.id}
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
            emptyTitle={status === 'finished' ? 'Nenhum embarque finalizado' : 'Nenhum embarque em andamento'}
            emptyMessage={
              hasFilters
                ? 'Nenhum embarque com esses filtros.'
                : status === 'finished'
                  ? 'Quando um embarque for finalizado, ele aparece aqui.'
                  : 'Toque em Novo embarque para começar.'
            }
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => {
          const count = item.animalCount ?? 0
          return (
            <AppCard padded={false}>
              <XStack
                items="center"
                justify="space-between"
                px={20}
                py={16}
                minH={TOQUE_MINIMO}
                gap={12}
                opacity={{ press: 0.85 }}
                onPress={() => router.push(`/embarques/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Abrir embarque ${item.name}`}>
                <YStack flex={1} gap={4}>
                  <Text fontSize={18} fontWeight="800" color="brandFg">
                    {item.name}
                  </Text>
                  <ShipmentStatusBadge status={item.status ?? 'in_progress'} />
                  <Text fontSize={16} fontWeight="600" color="brandFg">
                    {item.shippedOn ? formatDatePtBr(item.shippedOn) : 'Sem data'}
                  </Text>
                  <Text fontSize={15} fontWeight="500" color="brandMuted">
                    {item.farmName || 'Fazenda não informada'} · {animalsCountLabel(count)}
                    {item.totalWeightKg ? ` · ${formatWeightKg(item.totalWeightKg)}` : ''}
                  </Text>
                  {/* Só admin: quem cadastrou, ou "Autor não registrado" (src/api/authorContract.ts). */}
                  {showAuthor ? <AuthorLines author={{ name: item.createdByName, email: item.createdByEmail }} /> : null}
                </YStack>
                <Ionicons name="chevron-forward" size={22} color={chevron} />
              </XStack>
            </AppCard>
          )
        }}
      />
    </YStack>
  )
}
