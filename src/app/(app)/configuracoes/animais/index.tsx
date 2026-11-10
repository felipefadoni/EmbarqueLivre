import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import { animalTypesApi, animalsApi, farmsApi, type Animal, type AnimalType, type Farm } from '@/api/catalog'
import { listAllPages, paginationParams, type ListPagingRequest } from '@/api/contract'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { SelectField } from '@/components/cadastros/SelectField'
import { AppCard } from '@/components/dashboard/AppCard'
import { useInfiniteList } from '@/features/cadastros/useInfiniteList'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

export default function AnimaisListScreen() {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const [farms, setFarms] = useState<Farm[]>([])
  const [types, setTypes] = useState<AnimalType[]>([])
  const [farmId, setFarmId] = useState('')
  const [typeId, setTypeId] = useState('')

  useEffect(() => {
    void Promise.all([listAllPages(farmsApi.list), listAllPages(animalTypesApi.list)])
      .then(([farmList, typeList]) => {
        setFarms(farmList)
        setTypes(typeList)
      })
      .catch(() => {
        // Filtros ficam vazios se as listas auxiliares falharem; a lista de animais ainda tenta carregar.
      })
  }, [])

  const load = useCallback(
    (paging: ListPagingRequest) =>
      animalsApi.list({
        farmId: farmId || undefined,
        animalTypeId: typeId || undefined,
        ...paginationParams(paging),
      }),
    [farmId, typeId],
  )
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useInfiniteList(load)

  const farmName = (animal: Animal) =>
    animal.farmName ?? farms.find((farm) => farm.id === animal.farmId)?.name ?? 'Fazenda não informada'
  const typeName = (animal: Animal) =>
    animal.animalTypeName ?? types.find((item) => item.id === animal.animalTypeId)?.name ?? 'Tipo não informado'

  return (
    <YStack flex={1} bg="appBg">
      <YStack px={20} pt={12} pb={8} gap={12}>
        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          rounded={16}
          bg="brandPrimary"
          opacity={{ press: 0.85 }}
          onPress={() => router.push('/configuracoes/animais/nova')}
          accessibilityRole="button"
          accessibilityLabel="Novo animal">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Novo animal
          </Text>
        </XStack>
        <SelectField
          label="Filtrar por fazenda"
          value={farmId}
          options={[{ value: '', label: 'Todas as fazendas' }, ...farms.map((farm) => ({ value: farm.id, label: farm.name }))]}
          onChange={setFarmId}
        />
        <SelectField
          label="Filtrar por tipo"
          value={typeId}
          options={[{ value: '', label: 'Todos os tipos' }, ...types.map((item) => ({ value: item.id, label: item.name }))]}
          onChange={setTypeId}
        />
      </YStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.code}
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
            emptyTitle="Nenhum animal"
            emptyMessage="Cadastre o primeiro animal ou ajuste os filtros."
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => (
          <AnimalRow animal={item} farmName={farmName(item)} typeName={typeName(item)} chevron={chevron} />
        )}
      />
    </YStack>
  )
}

function AnimalRow({
  animal,
  farmName,
  typeName,
  chevron,
}: {
  animal: Animal
  farmName: string
  typeName: string
  chevron: string
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
        opacity={{ press: 0.85 }}
        onPress={() => router.push(`/configuracoes/animais/${animal.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Editar animal ${animal.code}`}>
        <YStack flex={1} gap={4}>
          <Text fontSize={18} fontWeight="800" color="brandFg">
            {animal.code}
          </Text>
          <Text fontSize={16} fontWeight="500" color="brandMuted">
            {farmName} · {typeName}
          </Text>
        </YStack>
        <Ionicons name="chevron-forward" size={22} color={chevron} />
      </XStack>
    </AppCard>
  )
}
