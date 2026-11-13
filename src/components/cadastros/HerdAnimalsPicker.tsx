import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Text, XStack, YStack } from 'tamagui'

import { HERDS_CONTRACT } from '@/api/herdsContract'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { todayIso } from '@/features/cadastros/dates'
import { useKeysetList } from '@/sync/hooks'
import { animalsListSpec, rowToAnimal, type AnimalRow } from '@/sync/queries'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../tamagui.config'

type HerdAnimalsPickerProps = {
  open: boolean
  farmId: string
  /** Pré-seleção (ex.: animais já escolhidos no cadastro ou pendência). */
  initialSelectedIds?: string[]
  herdId?: string
  herdName: string
  onClose: () => void
  onAdd: (animalIds: string[]) => void
}

export function HerdAnimalsPicker({ open, farmId, herdId, herdName, initialSelectedIds, onClose, onAdd }: HerdAnimalsPickerProps) {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, true>>({})
  const [confirmMove, setConfirmMove] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), HERDS_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [input])

  const [opened, setOpened] = useState(open)
  if (opened !== open) {
    setOpened(open)
    if (open) {
      setInput('')
      setSearch('')
      setSelected(Object.fromEntries((initialSelectedIds ?? []).map((id) => [id, true as const])))
      setConfirmMove(false)
    }
  }

  const today = todayIso()
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useKeysetList(
    // Keyset: código + id (mesma ordem da lista de Animais).
    () => animalsListSpec({ farmId: farmId || undefined, code: search || undefined }, today),
    (row: AnimalRow) => rowToAnimal(row),
    [farmId, search, today, open],
  )

  const candidates = useMemo(() => items.filter((item) => item.herdId !== herdId), [items, herdId])
  const selectedIds = useMemo(() => Object.keys(selected), [selected])
  const moving = useMemo(
    () => candidates.filter((item) => selected[item.id] && item.herdId && item.herdId !== herdId),
    [candidates, selected, herdId],
  )

  function toggle(id: string) {
    setSelected((current) => {
      const next = { ...current }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })
  }

  function requestAdd() {
    if (selectedIds.length === 0) return
    if (moving.length > 0) {
      setConfirmMove(true)
      return
    }
    onAdd(selectedIds)
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(15, 28, 24, 0.55)', justifyContent: 'flex-end' }}
        onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={{ maxHeight: '90%' }}>
          <YStack
            bg="cardBg"
            p={20}
            gap={12}
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: Math.max(insets.bottom, 16),
              minHeight: 480,
            }}>
            <XStack items="center" justify="space-between" minH={56}>
              <Text fontSize={22} fontWeight="800" color="brandFg" flex={1}>
                Adicionar animais
              </Text>
              <XStack minH={56} px={12} items="center" onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar">
                <Text fontSize={16} fontWeight="800" color="brandFg">
                  Fechar
                </Text>
              </XStack>
            </XStack>
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
                placeholder="Buscar pelo código"
                placeholderTextColor="brandMuted"
                value={input}
                onChangeText={setInput}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Buscar pelo código"
              />
            </XStack>
            <FlatList
              data={candidates}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ minHeight: 240 }}
              contentContainerStyle={{ flexGrow: 1, gap: 4, paddingBottom: 8 }}
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
                  emptyTitle="Nenhum animal"
                  emptyMessage={
                    farmId
                      ? 'Todos os animais desta fazenda já estão neste rebanho, ou não há animais para selecionar.'
                      : 'Selecione a fazenda do rebanho para listar os animais.'
                  }
                  onRetry={() => void reload()}
                />
              }
              renderItem={({ item }) => {
                const checked = Boolean(selected[item.id])
                const otherHerd = item.herdId && item.herdId !== herdId
                return (
                  <XStack
                    items="center"
                    gap={12}
                    minH={TOQUE_MINIMO}
                    px={4}
                    opacity={{ press: 0.85 }}
                    onPress={() => toggle(item.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`Animal ${item.code}`}>
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={26}
                      color={checked ? (isDark ? '#7DFFB3' : '#1B6B43') : iconColor}
                    />
                    <YStack flex={1} gap={2}>
                      <Text fontSize={17} fontWeight="800" color="brandFg">
                        {item.code}
                      </Text>
                      <Text fontSize={14} fontWeight="500" color="brandMuted">
                        {item.animalTypeName || 'Tipo não informado'}
                      </Text>
                      {otherHerd ? (
                        <Text fontSize={13} fontWeight="700" color="brandMuted">
                          Já está no rebanho {item.herdName || 'outro'} e será movido
                        </Text>
                      ) : null}
                    </YStack>
                  </XStack>
                )
              }}
            />
            <XStack
              minH={TOQUE_PRINCIPAL}
              items="center"
              justify="center"
              rounded={16}
              bg="brandPrimary"
              opacity={{ default: selectedIds.length === 0 ? 0.55 : 1, press: 0.85 }}
              onPress={selectedIds.length === 0 ? undefined : requestAdd}
              accessibilityRole="button"
              accessibilityLabel="Confirmar animais"
              accessibilityState={{ disabled: selectedIds.length === 0 }}>
              <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
                {selectedIds.length === 0
                  ? 'Selecione animais'
                  : `Adicionar ${selectedIds.length} ${selectedIds.length === 1 ? 'animal' : 'animais'}`}
              </Text>
            </XStack>
          </YStack>
        </Pressable>
      </Pressable>
      <ConfirmDialog
        open={confirmMove}
        title="Mover animais de outro rebanho?"
        message={
          moving.length === 1
            ? `O animal ${moving[0].code} já está no rebanho ${moving[0].herdName || 'outro'} e será movido para ${herdName}.`
            : `${moving.length} animais já estão em outro rebanho e serão movidos para ${herdName}.`
        }
        confirmLabel="Mover e adicionar"
        cancelLabel="Voltar"
        onCancel={() => setConfirmMove(false)}
        onConfirm={() => {
          setConfirmMove(false)
          onAdd(selectedIds)
        }}
      />
    </Modal>
  )
}
