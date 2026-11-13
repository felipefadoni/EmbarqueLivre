import Ionicons from '@expo/vector-icons/Ionicons'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Modal, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Text, XStack, YStack } from 'tamagui'

import { listAccounts, type Account } from '@/api/accounts'
import { USERS_CONTRACT, type ListPagingRequest } from '@/api/contract'
import { KeyboardSheet } from '@/components/form/KeyboardSheet'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { useInfiniteList } from '@/features/cadastros/useInfiniteList'
import { OfflineNotice } from '@/components/sync/OfflineNotice'
import { TOQUE_MINIMO } from '../../../tamagui.config'

type AccountPickerProps = {
  label: string
  value: string
  selected: Account | null
  onChange: (account: Account) => void
  error?: string
  disabled?: boolean
  placeholder?: string
}

/** Escolha de conta (admin): GET /accounts, busca + paginação, só online. Modelado no MasterPicker. */
export function AccountPicker({
  label,
  value,
  selected,
  onChange,
  error,
  disabled = false,
  placeholder = 'Selecione a conta',
}: AccountPickerProps) {
  const [open, setOpen] = useState(false)
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const displayName = selected?.id === value ? selected.name : undefined
  const displayEmail = selected?.id === value ? mastersLabel(selected.masterCount) : undefined

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
      {/* A lista de contas vem da API (não é sincronizada): precisa de internet. */}
      {disabled ? null : <OfflineNotice message="Sem internet. A escolha da conta precisa de conexão." />}

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
            <AccountPickerList
              selectedId={value}
              isDark={isDark}
              onSelect={(account) => {
                onChange(account)
                setOpen(false)
              }}
            />
          </YStack>
        </KeyboardSheet>
      </Modal>
    </YStack>
  )
}

function AccountPickerList({
  selectedId,
  isDark,
  onSelect,
}: {
  selectedId: string
  isDark: boolean
  onSelect: (account: Account) => void
}) {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), USERS_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [input])

  const load = useCallback((paging: ListPagingRequest) => listAccounts({ ...paging, search: search || undefined }), [search])
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useInfiniteList(load)

  return (
    <YStack flex={1} gap={12} minH={280}>
      <XStack minH={TOQUE_MINIMO} items="center" bg="brandSurface" borderColor="brandBorder" borderWidth={2} rounded={16} px="3">
        <Ionicons name="search" size={20} color={isDark ? '#A8B8AF' : '#3A5247'} />
        <Input
          flex={1}
          h="100%"
          fontSize={18}
          fontWeight="600"
          color="brandFg"
          bg="transparent"
          borderWidth={0}
          placeholder="Buscar conta pelo nome"
          placeholderTextColor="brandMuted"
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Buscar conta pelo nome"
        />
      </XStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
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
            emptyTitle="Nenhuma conta encontrada"
            emptyMessage={search ? 'Tente outro nome.' : 'Não há contas para selecionar.'}
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
              accessibilityLabel={[item.name, mastersLabel(item.masterCount)].filter(Boolean).join(', ')}>
              <YStack flex={1} gap={2}>
                <Text fontSize={18} fontWeight={active ? '800' : '700'} color="brandFg">
                  {item.name}
                </Text>
                {mastersLabel(item.masterCount) ? (
                  <Text fontSize={15} fontWeight="500" color="brandMuted">
                    {mastersLabel(item.masterCount)}
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

function mastersLabel(count: number | null): string | undefined {
  if (count == null) return undefined
  return count === 1 ? '1 Usuário Master' : `${count} Usuários Master`
}
