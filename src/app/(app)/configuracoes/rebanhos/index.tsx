import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Input, Text, XStack, YStack } from 'tamagui'

import { HERDS_CONTRACT } from '@/api/herdsContract'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { SelectField } from '@/components/cadastros/SelectField'
import { AppCard } from '@/components/dashboard/AppCard'
import { formatDatePtBr } from '@/features/cadastros/dates'
import { summarizeHerdFilters } from '@/features/cadastros/herdFilters'
import { useLocalFarms, useLocalList } from '@/sync/hooks'
import { firstParam } from '@/sync/params'
import { herdsListQuery, rowToHerd, type HerdRow } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

export default function RebanhosListScreen() {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const farms = useLocalFarms()
  const params = useLocalSearchParams<{ farmId?: string }>()
  const paramFarm = firstParam(params.farmId)
  const [farmId, setFarmId] = useState(paramFarm ?? '')
  const paramsKey = paramFarm ?? ''
  const [appliedParams, setAppliedParams] = useState(paramsKey)
  if (appliedParams !== paramsKey) {
    setAppliedParams(paramsKey)
    setFarmId(paramFarm ?? '')
  }
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), HERDS_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useLocalList(
    (limit) => herdsListQuery({ farmId: farmId || undefined, search: search || undefined }, limit),
    (row: HerdRow) => rowToHerd(row),
    [farmId, search],
  )

  const farmName = farmId ? farms.find((farm) => farm.id === farmId)?.name : undefined
  const filterSummary = useMemo(() => summarizeHerdFilters({ farmName, search: searchInput }), [farmName, searchInput])

  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
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
            onPress={() => router.push('/configuracoes/rebanhos/nova')}
            accessibilityRole="button"
            accessibilityLabel="Novo rebanho">
            <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
              Novo rebanho
            </Text>
          </XStack>
          <FilterToggle open={filtersOpen} activeCount={filterSummary.activeCount} onPress={() => toggleFilters()} />
        </XStack>
        <CollapsibleFilters open={filtersOpen} summary={filterSummary.text} onOpen={() => toggleFilters(true)}>
          <SelectField
            label="Fazenda"
            value={farmId}
            options={[{ value: '', label: 'Todas as fazendas' }, ...farms.map((farm) => ({ value: farm.id, label: farm.name }))]}
            onChange={setFarmId}
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
              accessibilityLabel="Buscar rebanho pelo nome"
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
        </CollapsibleFilters>
      </YStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1, gap: 12 }}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => {
          if (hasMore && !loading && !refreshing) void loadMore()
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ListLoadingFooter /> : undefined}
        ListEmptyComponent={
          <ListStatus
            loading={loading}
            error={error}
            empty={!loading && !error}
            emptyTitle="Nenhum rebanho"
            emptyMessage={farmId || search ? 'Nenhum rebanho com esses filtros.' : 'Cadastre o primeiro rebanho para começar.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => (
          <AppCard padded={false}>
            <XStack
              items="center"
              justify="space-between"
              px={20}
              py={16}
              minH={TOQUE_MINIMO}
              gap={12}
              opacity={{ press: 0.85 }}
              onPress={() => router.push(`/configuracoes/rebanhos/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Editar rebanho ${item.name}`}>
              <YStack flex={1} gap={4}>
                <Text fontSize={18} fontWeight="800" color="brandFg">
                  {item.name}
                </Text>
                <Text fontSize={16} fontWeight="500" color="brandMuted">
                  {item.farmName || 'Fazenda não informada'} · {item.animalCount === 1 ? '1 animal' : `${item.animalCount ?? 0} animais`}
                </Text>
                {item.formedAt ? (
                  <Text fontSize={15} fontWeight="500" color="brandMuted">
                    Formado em {formatDatePtBr(item.formedAt)}
                  </Text>
                ) : null}
              </YStack>
              <Ionicons name="chevron-forward" size={22} color={chevron} />
            </XStack>
          </AppCard>
        )}
      />
    </YStack>
  )
}
