import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Text, XStack, YStack } from 'tamagui'

import { isWithdrawalActive, VACCINATION_CONTRACT, type VaccinationEntry } from '@/api/contract'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { SelectField } from '@/components/cadastros/SelectField'
import { WithdrawalBadge } from '@/components/cadastros/WithdrawalBadge'
import { AppCard } from '@/components/dashboard/AppCard'
import { DateField } from '@/components/form/DateField'
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator'
import { formatDatePtBr, todayIso } from '@/features/cadastros/dates'
import { summarizeVaccinationFilters } from '@/features/vacinacoes/filterSummary'
import { useLocalFarms, useLocalList } from '@/sync/hooks'
import { firstParam } from '@/sync/params'
import { rowToVaccination, vaccinationsListQuery } from '@/sync/queries'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../../tamagui.config'

/** Aceita só YYYY-MM-DD até hoje (data local); qualquer outra coisa é ignorada. */
function validParamDate(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= todayIso() ? value : undefined
}

export default function LancamentosScreen() {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  // Filtros podem vir do Dashboard: ?date=YYYY-MM-DD&farmId=... (sem date = hoje).
  const params = useLocalSearchParams<{ date?: string; farmId?: string }>()
  const paramDate = validParamDate(firstParam(params.date))
  const paramFarm = firstParam(params.farmId)
  const [date, setDate] = useState(() => paramDate ?? todayIso())
  const [farmId, setFarmId] = useState(paramFarm ?? '')
  // A aba pode já estar montada: parâmetros novos substituem os filtros (o painel continua fechado; o resumo mostra).
  const paramsKey = `${paramDate ?? ''}|${paramFarm ?? ''}`
  const [appliedParams, setAppliedParams] = useState(paramsKey)
  if (appliedParams !== paramsKey) {
    setAppliedParams(paramsKey)
    setDate(paramDate ?? todayIso())
    setFarmId(paramFarm ?? '')
  }
  const farms = useLocalFarms()
  const [codeInput, setCodeInput] = useState('')
  const [code, setCode] = useState('')
  // Painel de filtros começa FECHADO; fechar não limpa os filtros.
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setCode(codeInput.trim()), VACCINATION_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [codeInput])

  // Lançamentos do dia (padrão: hoje), por fazenda e código — consulta local reativa.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useLocalList(
    (limit) => vaccinationsListQuery({ date, farmId: farmId || undefined, code: code || undefined }, limit),
    rowToVaccination,
    [date, farmId, code],
  )
  const isToday = date === todayIso()
  const farmName = farmId ? farms.find((farm) => farm.id === farmId)?.name : undefined
  const filterSummary = useMemo(
    () =>
      summarizeVaccinationFilters({
        date,
        today: todayIso(),
        farmName,
        code: codeInput,
      }),
    [date, farmName, codeInput],
  )
  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
  }

  return (
    <YStack flex={1} bg="appBg">
      <YStack px={20} pt={insets.top + 8} pb={8} gap={12}>
        <XStack items="center" gap={12}>
          <YStack flex={1} gap={4} minH={56} justify="center">
            <Text fontSize={28} fontWeight="800" color="brandFg">
              Vacinas
            </Text>
            <Text fontSize={16} fontWeight="600" color="brandMuted">
              Lançamentos de vacina e carência dos animais.
            </Text>
          </YStack>
          <FilterToggle open={filtersOpen} activeCount={filterSummary.activeCount} onPress={() => toggleFilters()} />
        </XStack>
        <SyncStatusIndicator compact />
        <XStack
          minH={TOQUE_PRINCIPAL}
          items="center"
          justify="center"
          gap={8}
          rounded={16}
          bg="brandPrimary"
          opacity={{ press: 0.85 }}
          onPress={() => router.push('/lancamentos/nova')}
          accessibilityRole="button"
          accessibilityLabel="Informar vacina">
          <Ionicons name="add-circle-outline" size={24} color={isDark ? '#2B3D34' : '#FFFFFF'} />
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Informar Vacina
          </Text>
        </XStack>
        <CollapsibleFilters open={filtersOpen} summary={filterSummary.text} onOpen={() => toggleFilters(true)}>
          <DateField
            label={isToday ? 'Data do lançamento (hoje)' : 'Data do lançamento'}
            value={date}
            onChange={(value) => setDate(value ?? todayIso())}
            maximumDate={new Date()}
            optional={false}
          />
          {isToday ? null : (
            <Text
              fontSize={16}
              fontWeight="800"
              color="brandFg"
              textDecorationLine="underline"
              onPress={() => setDate(todayIso())}
              accessibilityRole="button"
              accessibilityLabel="Voltar para hoje">
              Voltar para hoje
            </Text>
          )}
          <SelectField
            label="Fazenda"
            value={farmId}
            options={[{ value: '', label: 'Todas' }, ...farms.map((farm) => ({ value: farm.id, label: farm.name }))]}
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
              placeholder="Buscar pelo código do brinco"
              placeholderTextColor="brandMuted"
              value={codeInput}
              onChangeText={setCodeInput}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Buscar pelo código do brinco"
            />
            {codeInput ? (
              <XStack
                minH={TOQUE_MINIMO}
                items="center"
                justify="center"
                style={{ width: 44 }}
                onPress={() => setCodeInput('')}
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
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 28,
          flexGrow: 1,
          gap: 12,
        }}
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
            emptyTitle="Nenhum lançamento"
            emptyMessage={
              code || farmId
                ? 'Nenhuma vacina encontrada com esses filtros.'
                : `Nenhuma vacina lançada em ${formatDatePtBr(date)}. Toque em "Informar Vacina" para lançar.`
            }
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => <VaccinationRow entry={item} chevron={iconColor} />}
      />
    </YStack>
  )
}

function VaccinationRow({ entry, chevron }: { entry: VaccinationEntry; chevron: string }) {
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
        onPress={() =>
          router.push({
            pathname: '/lancamentos/[id]',
            params: { id: entry.id },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`Editar lançamento do animal ${entry.animalCode}, ${entry.vaccineName}`}>
        <YStack flex={1} gap={4}>
          <Text fontSize={18} fontWeight="800" color="brandFg">
            {entry.animalCode || 'Animal sem código'}
          </Text>
          <Text fontSize={16} fontWeight="600" color="brandFg">
            {entry.vaccineName || 'Vacina não informada'}
          </Text>
          <Text fontSize={15} fontWeight="500" color="brandMuted">
            {entry.farmName || 'Fazenda não informada'}
          </Text>
          <Text fontSize={15} fontWeight="600" color="brandMuted" mt={4}>
            Aplicada em {formatDatePtBr(entry.appliedAt) || '—'}
          </Text>
          {entry.withdrawalUntil ? (
            <XStack mt={4}>
              <WithdrawalBadge
                active={isWithdrawalActive(entry.withdrawalUntil)}
                activeLabel={`Livre em ${formatDatePtBr(entry.withdrawalUntil)}`}
                inactiveLabel={`Livre desde ${formatDatePtBr(entry.withdrawalUntil)}`}
              />
            </XStack>
          ) : null}
        </YStack>
        <Ionicons name="chevron-forward" size={22} color={chevron} />
      </XStack>
    </AppCard>
  )
}
