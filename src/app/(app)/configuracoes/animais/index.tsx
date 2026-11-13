import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import type { Animal } from '@/api/catalog'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { SelectField } from '@/components/cadastros/SelectField'
import { TextFilterField } from '@/components/cadastros/TextFilterField'
import { WithdrawalBadge } from '@/components/cadastros/WithdrawalBadge'
import { AppCard } from '@/components/dashboard/AppCard'
import { useAuth } from '@/features/auth/AuthProvider'
import { summarizeAnimalFilters } from '@/features/cadastros/animalFilters'
import { authorLine, canFilterByAuthorEmail, canSeeAuthor, canUseAdminFilters } from '@/features/cadastros/farmFilters'
import { matchingFarmIds } from '@/features/cadastros/textFilter'
import { formatDayMonthPtBr, todayIso } from '@/features/cadastros/dates'
import { useKeysetList, useLocalAnimalTypes, useLocalFarms, useLocalHerds } from '@/sync/hooks'
import { firstParam } from '@/sync/params'
import { animalsListSpec, isAnimalSituation, rowToAnimal, type AnimalRow as LocalAnimalRow, type AnimalSituation } from '@/sync/queries'
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
  const { user } = useAuth()
  // Só admin: filtro por nome da fazenda (texto, sem acentos) e, com o contrato do autor, por e-mail.
  const adminFilters = canUseAdminFilters(user?.role)
  const showAuthor = canSeeAuthor(user?.role, 'animals')
  const showAuthorEmail = canFilterByAuthorEmail(user?.role, 'animals')
  const [farmSearch, setFarmSearch] = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const farmIds = useMemo(() => (adminFilters ? matchingFarmIds(farms, farmSearch) : undefined), [adminFilters, farms, farmSearch])
  // Filtros podem vir do Dashboard: ?situacao=carencia&farmId=...&animalTypeId=...
  const params = useLocalSearchParams<{ situacao?: string; farmId?: string; animalTypeId?: string; herdId?: string }>()
  const paramSituation = firstParam(params.situacao)
  const paramFarm = firstParam(params.farmId)
  const paramType = firstParam(params.animalTypeId)
  const paramHerd = firstParam(params.herdId)
  const [farmId, setFarmId] = useState(paramFarm ?? '')
  const [typeId, setTypeId] = useState(paramType ?? '')
  const [situacao, setSituacao] = useState<'' | AnimalSituation>(isAnimalSituation(paramSituation) ? paramSituation : '')
  const [herdId, setHerdId] = useState(paramHerd ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  // A tela pode já estar montada na pilha: parâmetros novos substituem os filtros (ajuste durante o render).
  const paramsKey = `${paramSituation ?? ''}|${paramFarm ?? ''}|${paramType ?? ''}|${paramHerd ?? ''}`
  const [appliedParams, setAppliedParams] = useState(paramsKey)
  if (appliedParams !== paramsKey) {
    setAppliedParams(paramsKey)
    setSituacao(isAnimalSituation(paramSituation) ? paramSituation : '')
    setFarmId(paramFarm ?? '')
    setTypeId(paramType ?? '')
    setHerdId(paramHerd ?? '')
  }
  const herds = useLocalHerds(farmId || undefined)
  const today = todayIso()
  const selectedFarmName = farmId ? farms.find((farm) => farm.id === farmId)?.name : undefined
  const selectedTypeName = typeId ? types.find((item) => item.id === typeId)?.name : undefined
  const selectedHerdName = herdId ? herds.find((herd) => herd.id === herdId)?.name : undefined
  const filterSummary = useMemo(
    () =>
      summarizeAnimalFilters({
        situacao,
        farmName: selectedFarmName,
        typeName: selectedTypeName,
        herdName: selectedHerdName,
        farmSearch: adminFilters ? farmSearch : undefined,
        authorEmail: showAuthorEmail ? authorEmail : undefined,
      }),
    [situacao, selectedFarmName, selectedTypeName, selectedHerdName, adminFilters, farmSearch, showAuthorEmail, authorEmail],
  )

  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
  }

  function clearFilters() {
    setSituacao('')
    setFarmId('')
    setTypeId('')
    setHerdId('')
    setFarmSearch('')
    setAuthorEmail('')
    router.setParams({ situacao: undefined, farmId: undefined, animalTypeId: undefined, herdId: undefined })
    setAppliedParams('|||')
  }

  // Lista local reativa: carência (SUM/MAX) calculada no SQLite do aparelho.
  // Scroll infinito com keyset (código + id; "livres em 7 dias": data + código + id).
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(
    () =>
      animalsListSpec(
        {
          farmId: farmId || undefined,
          farmIds,
          animalTypeId: typeId || undefined,
          herdId: herdId || undefined,
          situacao: situacao || undefined,
          // Só admin: e-mail de quem cadastrou (lista e filtro). Master/básico: undefined = SQL de antes.
          ...(showAuthor ? { withAuthor: true, authorEmail: showAuthorEmail ? authorEmail : undefined } : {}),
        },
        today,
      ),
    (row: LocalAnimalRow) => rowToAnimal(row),
    [farmId, farmIds, typeId, herdId, situacao, today, showAuthor, showAuthorEmail, authorEmail],
  )

  const farmName = (animal: Animal) =>
    animal.farmName ?? farms.find((farm) => farm.id === animal.farmId)?.name ?? 'Fazenda não informada'
  const typeName = (animal: Animal) =>
    animal.animalTypeName ?? types.find((item) => item.id === animal.animalTypeId)?.name ?? 'Tipo não informado'

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
            onPress={() => router.push('/configuracoes/animais/nova')}
            accessibilityRole="button"
            accessibilityLabel="Novo animal">
            <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
              Novo animal
            </Text>
          </XStack>
          <FilterToggle open={filtersOpen} activeCount={filterSummary.activeCount} onPress={() => toggleFilters()} />
        </XStack>
        <CollapsibleFilters
          open={filtersOpen}
          summary={filterSummary.text}
          onOpen={() => toggleFilters(true)}
          onClear={clearFilters}
          clearable={filterSummary.activeCount > 0}>
          <SelectField
            label="Filtrar por fazenda"
            value={farmId}
            options={[{ value: '', label: 'Todas as fazendas' }, ...farms.map((farm) => ({ value: farm.id, label: farm.name }))]}
            onChange={(value) => {
              setFarmId(value)
              setHerdId('')
            }}
          />
          {adminFilters ? (
            <TextFilterField label="Nome da fazenda" value={farmSearch} placeholder="Buscar pelo nome da fazenda" onChange={setFarmSearch} />
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
          <SelectField
            label="Filtrar por tipo"
            value={typeId}
            options={[{ value: '', label: 'Todos os tipos' }, ...types.map((item) => ({ value: item.id, label: item.name }))]}
            onChange={setTypeId}
          />
          <SelectField
            label="Filtrar por rebanho"
            value={herdId}
            options={[{ value: '', label: 'Todos os rebanhos' }, ...herds.map((herd) => ({ value: herd.id, label: farmId ? herd.name : `${herd.name} · ${herd.farmName ?? 'Fazenda'}` }))]}
            onChange={setHerdId}
          />
          <SelectField
            label="Situação"
            value={situacao}
            options={SITUATION_OPTIONS}
            onChange={(value) => setSituacao(isAnimalSituation(value) ? value : '')}
          />
        </CollapsibleFilters>
      </YStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.code}
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
            emptyTitle="Nenhum animal"
            emptyMessage={situacao ? 'Nenhum animal nesta situação com esses filtros.' : 'Cadastre o primeiro animal ou ajuste os filtros.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => (
          <AnimalRow
            animal={item}
            farmName={farmName(item)}
            typeName={typeName(item)}
            chevron={chevron}
            author={showAuthor ? authorLine({ name: item.createdByName, email: item.createdByEmail }, 'animal') : undefined}
          />
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
  author,
}: {
  animal: Animal
  farmName: string
  typeName: string
  chevron: string
  /** Só admin: e-mail de quem cadastrou, ou "Autor não registrado" (src/api/authorContract.ts). */
  author?: string
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
            {farmName} · {typeName}{animal.herdName ? ` · ${animal.herdName}` : ''}
          </Text>
          {author ? (
            <Text fontSize={15} fontWeight="600" color="brandMuted" numberOfLines={1}>
              {author}
            </Text>
          ) : null}
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
