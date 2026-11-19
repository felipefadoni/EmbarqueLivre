import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Text, XStack, YStack } from 'tamagui'

import { formatWeightKg } from '@/api/shipmentsContract'
import { VACCINATION_CONTRACT } from '@/api/contract'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { SelectField } from '@/components/cadastros/SelectField'
import { AuthorLines } from '@/components/cadastros/AuthorLines'
import { AppCard } from '@/components/dashboard/AppCard'
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator'
import { useAuth } from '@/features/auth/AuthProvider'
import { canFilterByAuthorEmail, canSeeAuthor, type AuthorValue } from '@/features/cadastros/farmFilters'
import { TextFilterField } from '@/components/cadastros/TextFilterField'
import { summarizeWeighingFilters } from '@/features/pesos/filterSummary'
import { useLocalFarms, useKeysetList } from '@/sync/hooks'
import { formatWeighedAt, rowToWeighing, weighingsListSpec, type WeighingEntry } from '@/sync/queries'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../../tamagui.config'

export default function PesosScreen() {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const [farmId, setFarmId] = useState('')
  const farms = useLocalFarms()
  // Só admin: autor (nome · e-mail) em cada pesagem e filtro pelo e-mail de quem lançou. Master/básico: inalterado.
  const { user } = useAuth()
  const showAuthor = canSeeAuthor(user?.role, 'weighings')
  const showAuthorEmail = canFilterByAuthorEmail(user?.role, 'weighings')
  const [authorEmail, setAuthorEmail] = useState('')
  const authorFilter = showAuthorEmail ? authorEmail : undefined
  const [codeInput, setCodeInput] = useState('')
  const [code, setCode] = useState('')
  // Painel de filtros começa FECHADO; fechar não limpa os filtros.
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setCode(codeInput.trim()), VACCINATION_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [codeInput])

  // Pesagens da mais recente para a mais antiga, por fazenda e brinco — consulta local reativa.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(
    () => weighingsListSpec({ farmId: farmId || undefined, code: code || undefined, withAuthor: showAuthor, authorEmail: authorFilter }),
    rowToWeighing,
    [farmId, code, showAuthor, authorFilter],
  )
  const farmName = farmId ? farms.find((farm) => farm.id === farmId)?.name : undefined
  const filterSummary = useMemo(
    () => summarizeWeighingFilters({ farmName, code: codeInput, authorEmail: authorFilter }),
    [farmName, codeInput, authorFilter],
  )
  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
  }

  function clearFilters() {
    setFarmId('')
    setCodeInput('')
    setCode('')
    setAuthorEmail('')
  }

  return (
    <YStack flex={1} bg="appBg">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: 28,
          flexGrow: 1,
          gap: 12,
        }}
        ListHeaderComponent={
          <YStack pb={8} gap={12}>
            <XStack items="center" gap={12}>
              <YStack flex={1} gap={4} minH={48} justify="center">
                <Text fontSize={24} fontWeight="800" color="brandFg">
                  Peso
                </Text>
                <Text fontSize={16} fontWeight="600" color="brandMuted">
                  Pesagens dos animais, da mais recente para a mais antiga.
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
              onPress={() => router.push('/pesos/nova')}
              accessibilityRole="button"
              accessibilityLabel="Lançar peso">
              <Ionicons name="add-circle-outline" size={22} color={isDark ? '#2B3D34' : '#FFFFFF'} />
              <Text fontSize={16} fontWeight="800" color="brandPrimaryFg">
                Lançar peso
              </Text>
            </XStack>
            <CollapsibleFilters open={filtersOpen} summary={filterSummary.text} onOpen={() => toggleFilters(true)} onClear={clearFilters} clearable={filterSummary.activeCount > 0}>
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
                <Ionicons name="search" size={18} color={iconColor} />
                <Input
                  flex={1}
                  h="100%"
                  fontSize={16}
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
                    <Ionicons name="close-circle" size={20} color={iconColor} />
                  </XStack>
                ) : null}
              </XStack>
              {showAuthorEmail ? (
                <TextFilterField
                  label="E-mail de quem lançou"
                  value={authorEmail}
                  placeholder="Buscar pelo e-mail"
                  keyboardType="email-address"
                  onChange={setAuthorEmail}
                />
              ) : null}
            </CollapsibleFilters>
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
            emptyTitle="Nenhuma pesagem"
            emptyMessage={
              code || farmId || authorFilter?.trim()
                ? 'Nenhuma pesagem encontrada com esses filtros.'
                : 'Nenhuma pesagem lançada. Toque em "Lançar peso" para registrar.'
            }
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => (
          <WeighingRow
            entry={item}
            chevron={iconColor}
            author={showAuthor ? { name: item.createdByName, email: item.createdByEmail } : undefined}
          />
        )}
      />
    </YStack>
  )
}

function WeighingRow({ entry, chevron, author }: { entry: WeighingEntry; chevron: string; author?: AuthorValue | null }) {
  const where = [entry.farmName, entry.herdName].filter(Boolean).join(' · ')
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
        onPress={() => router.push({ pathname: '/pesos/[id]', params: { id: entry.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Corrigir a pesagem de ${formatWeightKg(entry.weightKg)} do brinco ${entry.animalCode}`}>
        <YStack flex={1} gap={4}>
          <Text fontSize={16} fontWeight="800" color="brandFg">
            Brinco {entry.animalCode || 'sem código'}
          </Text>
          <Text fontSize={16} fontWeight="800" color="brandFg">
            {formatWeightKg(entry.weightKg)}
          </Text>
          {where ? (
            <Text fontSize={15} fontWeight="500" color="brandMuted">
              {where}
            </Text>
          ) : null}
          <Text fontSize={15} fontWeight="600" color="brandMuted" mt={4}>
            {formatWeighedAt(entry.weighedAt) || 'Momento não informado'}
          </Text>
          {author !== undefined ? <AuthorLines author={author} /> : null}
        </YStack>
        <Ionicons name="chevron-forward" size={20} color={chevron} />
      </XStack>
    </AppCard>
  )
}
