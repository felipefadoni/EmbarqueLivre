import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import type { Animal } from '@/api/catalog'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { SelectField } from '@/components/cadastros/SelectField'
import { WithdrawalBadge } from '@/components/cadastros/WithdrawalBadge'
import { AppCard } from '@/components/dashboard/AppCard'
import { formatDayMonthPtBr, todayIso } from '@/features/cadastros/dates'
import { useLocalAnimalTypes, useLocalFarms, useLocalList } from '@/sync/hooks'
import { firstParam } from '@/sync/params'
import { animalsListQuery, isAnimalSituation, rowToAnimal, type AnimalRow as LocalAnimalRow, type AnimalSituation } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

const SITUATION_OPTIONS: { value: '' | AnimalSituation; label: string }[] = [
  { value: '', label: 'Todas as situações' },
  { value: 'liberado', label: 'Liberados (aptos para embarque)' },
  { value: 'carencia', label: 'Em carência' },
  { value: 'libera7', label: 'Ficam livres em até 7 dias' },
  { value: 'sem_historico', label: 'Sem histórico de vacina' },
]

export default function AnimaisListScreen() {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const farms = useLocalFarms()
  const types = useLocalAnimalTypes()
  // Filtros podem vir do Dashboard: ?situacao=carencia&farmId=...&animalTypeId=...
  const params = useLocalSearchParams<{ situacao?: string; farmId?: string; animalTypeId?: string }>()
  const paramSituation = firstParam(params.situacao)
  const paramFarm = firstParam(params.farmId)
  const paramType = firstParam(params.animalTypeId)
  const [farmId, setFarmId] = useState(paramFarm ?? '')
  const [typeId, setTypeId] = useState(paramType ?? '')
  const [situacao, setSituacao] = useState<'' | AnimalSituation>(isAnimalSituation(paramSituation) ? paramSituation : '')
  // A tela pode já estar montada na pilha: parâmetros novos substituem os filtros (ajuste durante o render).
  const paramsKey = `${paramSituation ?? ''}|${paramFarm ?? ''}|${paramType ?? ''}`
  const [appliedParams, setAppliedParams] = useState(paramsKey)
  if (appliedParams !== paramsKey) {
    setAppliedParams(paramsKey)
    setSituacao(isAnimalSituation(paramSituation) ? paramSituation : '')
    setFarmId(paramFarm ?? '')
    setTypeId(paramType ?? '')
  }
  const today = todayIso()

  // Lista local reativa: carência (SUM/MAX) calculada no SQLite do aparelho.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useLocalList(
    (limit) =>
      animalsListQuery({ farmId: farmId || undefined, animalTypeId: typeId || undefined, situacao: situacao || undefined }, today, limit),
    (row: LocalAnimalRow) => rowToAnimal(row),
    [farmId, typeId, situacao, today],
  )

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
        <SelectField
          label="Situação"
          value={situacao}
          options={SITUATION_OPTIONS}
          onChange={(value) => setSituacao(isAnimalSituation(value) ? value : '')}
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
            emptyMessage={situacao ? 'Nenhum animal nesta situação com esses filtros.' : 'Cadastre o primeiro animal ou ajuste os filtros.'}
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
          {animal.withdrawalSummary?.inWithdrawal ? (
            <XStack mt={4}>
              <WithdrawalBadge
                active
                activeLabel={
                  animal.withdrawalSummary.freeAt
                    ? `Em carência · livre em ${formatDayMonthPtBr(animal.withdrawalSummary.freeAt)}`
                    : 'Em carência'
                }
                inactiveLabel="Livre"
              />
            </XStack>
          ) : null}
        </YStack>
        <Ionicons name="chevron-forward" size={22} color={chevron} />
      </XStack>
    </AppCard>
  )
}
