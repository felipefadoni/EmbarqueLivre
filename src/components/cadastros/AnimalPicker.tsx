import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useState } from 'react'
import { FlatList, Modal, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Text, XStack, YStack } from 'tamagui'

import { VACCINATION_CONTRACT } from '@/api/contract'
import { KeyboardSheet } from '@/components/form/KeyboardSheet'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { todayIso } from '@/features/cadastros/dates'
import { useKeysetList } from '@/sync/hooks'
import { animalsListSpec, rowToAnimal, type AnimalRow } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../tamagui.config'

/** Dados mínimos para exibir o animal escolhido (vem da lista ou do lançamento em edição). */
export type PickedAnimal = {
  id: string
  code: string
  farmName?: string
  animalTypeName?: string
}

type AnimalPickerProps = {
  label: string
  selected: PickedAnimal | null
  onChange: (animal: PickedAnimal) => void
  error?: string
  disabled?: boolean
  placeholder?: string
}

function describe(animal: PickedAnimal) {
  return [animal.farmName, animal.animalTypeName].filter(Boolean).join(' · ')
}

export function AnimalPicker({
  label,
  selected,
  onChange,
  error,
  disabled = false,
  placeholder = 'Selecione o animal',
}: AnimalPickerProps) {
  const [open, setOpen] = useState(false)
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const details = selected ? describe(selected) : ''

  return (
    <YStack gap="2" w="100%">
      <Text fontSize={16} fontWeight="700" color="brandFg" lineHeight="22px">
        {label}
      </Text>
      <XStack
        minH={TOQUE_MINIMO}
        items="center"
        justify="space-between"
        bg="brandSurface"
        borderColor={error ? 'brandError' : 'brandBorder'}
        borderWidth={2}
        rounded={16}
        px="3"
        w="100%"
        opacity={{ default: disabled ? 0.7 : 1, press: 0.9 }}
        onPress={disabled ? undefined : () => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={selected ? `${selected.code} ${details}` : placeholder}
        accessibilityState={{ disabled }}>
        <YStack flex={1} py={8} gap={2}>
          {selected ? (
            <>
              <Text fontSize={18} fontWeight="800" color="brandFg">
                {selected.code}
              </Text>
              {details ? (
                <Text fontSize={15} fontWeight="500" color="brandMuted">
                  {details}
                </Text>
              ) : null}
            </>
          ) : (
            <Text fontSize={18} fontWeight="600" color="brandMuted">
              {placeholder}
            </Text>
          )}
        </YStack>
        {disabled ? null : <Ionicons name="chevron-down" size={22} color={isDark ? '#A8B8AF' : '#3A5247'} />}
      </XStack>
      {error ? (
        <Text fontSize={15} lineHeight="20px" color="brandError" fontWeight="700" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardSheet onDismiss={() => setOpen(false)} minHeight={420} maxHeightRatio={0.85}>
          <YStack
            grow={1}
            shrink={1}
            bg="cardBg"
            p={20}
            gap={12}
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: Math.max(insets.bottom, 16),
            }}>
            <XStack items="center" justify="space-between" minH={56}>
              <Text fontSize={22} fontWeight="800" color="brandFg" flex={1}>
                {label}
              </Text>
              <XStack
                minH={56}
                px={12}
                items="center"
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Fechar">
                <Text fontSize={16} fontWeight="800" color="brandFg">
                  Fechar
                </Text>
              </XStack>
            </XStack>
            <AnimalPickerList
              selectedId={selected?.id ?? ''}
              isDark={isDark}
              onSelect={(animal) => {
                onChange(animal)
                setOpen(false)
              }}
            />
          </YStack>
        </KeyboardSheet>
      </Modal>
    </YStack>
  )
}

function AnimalPickerList({
  selectedId,
  isDark,
  onSelect,
}: {
  selectedId: string
  isDark: boolean
  onSelect: (animal: PickedAnimal) => void
}) {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), VACCINATION_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [input])

  // Busca local por código (contém, sem diferenciar maiúsculas).
  const today = todayIso()
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(
    // Keyset: código + id (mesma ordem da lista de Animais).
    () => animalsListSpec({ code: search || undefined }, today),
    (row: AnimalRow) => rowToAnimal(row),
    [search, today],
  )

  return (
    <YStack flex={1} gap={12} minH={280}>
      <XStack
        minH={TOQUE_MINIMO}
        items="center"
        bg="brandSurface"
        borderColor="brandBorder"
        borderWidth={2}
        rounded={16}
        px="3">
        <Ionicons name="search" size={20} color={isDark ? '#A8B8AF' : '#3A5247'} />
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
          value={input}
          onChangeText={setInput}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Buscar animal pelo código"
        />
      </XStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.code}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
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
            emptyTitle="Nenhum animal encontrado"
            emptyMessage={search ? 'Tente outro código.' : 'Cadastre animais no Menu > Animais.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => {
          const active = item.id === selectedId
          const picked: PickedAnimal = {
            id: item.id,
            code: item.code,
            farmName: item.farmName,
            animalTypeName: item.animalTypeName,
          }
          const details = describe(picked)
          return (
            <XStack
              minH={TOQUE_MINIMO}
              items="center"
              justify="space-between"
              px={12}
              py={10}
              rounded={16}
              bg={active ? (isDark ? '#1C3C31' : '#EEF6EF') : 'transparent'}
              onPress={() => onSelect(picked)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.code}${details ? `, ${details}` : ''}`}>
              <YStack flex={1} gap={2}>
                <Text fontSize={18} fontWeight={active ? '800' : '700'} color="brandFg">
                  {item.code}
                </Text>
                {details ? (
                  <Text fontSize={15} fontWeight="500" color="brandMuted">
                    {details}
                  </Text>
                ) : null}
              </YStack>
              {active ? <Ionicons name="checkmark" size={22} color={isDark ? '#99C2AB' : '#2B3D34'} /> : null}
            </XStack>
          )
        }}
      />
    </YStack>
  )
}
