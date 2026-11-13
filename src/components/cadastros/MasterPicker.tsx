import Ionicons from '@expo/vector-icons/Ionicons'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Modal, Pressable, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Text, XStack, YStack } from 'tamagui'

import { listMasters, type MasterUser } from '@/api/masters'
import { type ListPagingRequest } from '@/api/contract'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { useInfiniteList } from '@/features/cadastros/useInfiniteList'
import { OfflineNotice } from '@/components/sync/OfflineNotice'
import { TOQUE_MINIMO } from '../../../tamagui.config'

type MasterPickerProps = {
  label: string
  value: string
  selected: MasterUser | null
  onChange: (master: MasterUser) => void
  error?: string
  disabled?: boolean
  placeholder?: string
}

export function MasterPicker({
  label,
  value,
  selected,
  onChange,
  error,
  disabled = false,
  placeholder = 'Selecione o master dono',
}: MasterPickerProps) {
  const [open, setOpen] = useState(false)
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const displayName = selected?.id === value ? selected.name : undefined
  const displayEmail = selected?.id === value ? selected.email : undefined

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
        accessibilityHint={displayName ?? placeholder}
        accessibilityState={{ disabled }}>
        <YStack flex={1} py={8} gap={2}>
          {displayName ? (
            <>
              <Text fontSize={18} fontWeight="700" color="brandFg">
                {displayName}
              </Text>
              {displayEmail ? (
                <Text fontSize={15} fontWeight="500" color="brandMuted">
                  {displayEmail}
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
      {/* A lista de masters vem da API (não é sincronizada): precisa de internet. */}
      {disabled ? null : <OfflineNotice message="Sem internet. A escolha do master dono precisa de conexão." />}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(15, 28, 24, 0.55)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ maxHeight: '85%' }}>
            <YStack
              bg="cardBg"
              p={20}
              gap={12}
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingBottom: Math.max(insets.bottom, 16),
                minHeight: 420,
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
              <MasterPickerList
                selectedId={value}
                isDark={isDark}
                onSelect={(master) => {
                  onChange(master)
                  setOpen(false)
                }}
              />
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </YStack>
  )
}

function MasterPickerList({
  selectedId,
  isDark,
  onSelect,
}: {
  selectedId: string
  isDark: boolean
  onSelect: (master: MasterUser) => void
}) {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 400)
    return () => clearTimeout(timer)
  }, [input])

  const load = useCallback(
    (paging: ListPagingRequest) => listMasters({ ...paging, search: search || undefined }),
    [search],
  )
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useInfiniteList(load)

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
          placeholder="Buscar por nome ou email"
          placeholderTextColor="brandMuted"
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Buscar master por nome ou email"
        />
      </XStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.email}
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
            emptyTitle="Nenhum master ativo encontrado"
            emptyMessage={search ? 'Tente outro nome ou email.' : 'Não há masters ativos para selecionar.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => {
          const active = item.id === selectedId
          return (
            <XStack
              minH={TOQUE_MINIMO}
              items="center"
              justify="space-between"
              px={12}
              py={10}
              rounded={16}
              bg={active ? (isDark ? '#1C3C31' : '#EEF6EF') : 'transparent'}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.name}, ${item.email}`}>
              <YStack flex={1} gap={2}>
                <Text fontSize={18} fontWeight={active ? '800' : '700'} color="brandFg">
                  {item.name}
                </Text>
                <Text fontSize={15} fontWeight="500" color="brandMuted">
                  {item.email}
                </Text>
              </YStack>
              {active ? <Ionicons name="checkmark" size={22} color={isDark ? '#99C2AB' : '#2B3D34'} /> : null}
            </XStack>
          )
        }}
      />
    </YStack>
  )
}

export function OwnerReadOnlyField({
  label,
  name,
  email,
  ownerUserId,
  unavailableLabel = 'Nome do dono indisponível',
}: {
  label: string
  name?: string
  email?: string
  ownerUserId: string
  /** Texto quando o nome não está disponível (ex.: offline, sem tabela de usuários no sync). */
  unavailableLabel?: string
}) {
  return (
    <YStack gap="2" w="100%">
      <Text fontSize={16} fontWeight="700" color="brandFg" lineHeight="22px">
        {label}
      </Text>
      <YStack
        minH={TOQUE_MINIMO}
        justify="center"
        bg="brandSurface"
        borderColor="brandBorder"
        borderWidth={2}
        rounded={16}
        px="3"
        py={10}
        w="100%"
        opacity={0.85}>
        {name ? (
          <>
            <Text fontSize={18} fontWeight="700" color="brandFg">
              {name}
            </Text>
            <Text fontSize={15} fontWeight="500" color="brandMuted">
              {email || ownerUserId}
            </Text>
          </>
        ) : (
          <>
            <Text fontSize={18} fontWeight="700" color="brandFg">
              {unavailableLabel}
            </Text>
            <Text fontSize={15} fontWeight="500" color="brandMuted">
              {ownerUserId}
            </Text>
          </>
        )}
      </YStack>
    </YStack>
  )
}
