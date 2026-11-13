import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Input, Text, XStack, YStack } from 'tamagui'

import { USERS_CONTRACT, type ListPagingRequest } from '@/api/contract'
import type { Account } from '@/api/accounts'
import { listUsers, listUsersCursor, type AccountUser } from '@/api/users'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { AccountPicker } from '@/components/cadastros/AccountPicker'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { TextFilterField } from '@/components/cadastros/TextFilterField'
import { RoleBadge } from '@/components/cadastros/RoleBadge'
import { AppCard } from '@/components/dashboard/AppCard'
import { OfflineNotice } from '@/components/sync/OfflineNotice'
import { useAuth } from '@/features/auth/AuthProvider'
import { canManageUsers } from '@/features/cadastros/permissions'
import { useInfiniteList } from '@/features/cadastros/useInfiniteList'
import { userStatusLabel } from '@/features/usuarios/rules'
import { authorLine } from '@/features/cadastros/farmFilters'
import { filterUsers, shouldAutoLoadMore, summarizeUserFilters, userServerFilters } from '@/features/usuarios/userFilters'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

/** Usuários da conta (ONLINE via REST). Basic não entra: redireciona para o Menu. */
export default function UsuariosListScreen() {
  const { user } = useAuth()
  if (!canManageUsers(user?.role)) return <Redirect href="/configuracoes" />
  // Admin: painel de filtros (conta, nome, e-mail). Master: busca única de antes, inalterada.
  if (user?.role === 'admin') return <UsuariosAdminList currentUserId={user?.id ?? null} />
  return <UsuariosList currentUserId={user?.id ?? null} isAdmin={false} />
}

function UsuariosAdminList({ currentUserId }: { currentUserId: string | null }) {
  const isDark = useColorScheme() === 'dark'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const [name, setName] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [email, setEmail] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Modo cursor (mais novos primeiro). Só o e-mail vai ao servidor; o nome é filtrado no aparelho, sem acentos
  // (ver userFilters.ts). Trocar filtro recria o loader → useInfiniteList recomeça sem cursor.
  useEffect(() => {
    const timer = setTimeout(() => setEmail(emailInput.trim()), USERS_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [emailInput])

  const load = useCallback(
    (paging: ListPagingRequest) => listUsersCursor({ ...paging, ...userServerFilters({ email }), accountId: account?.id }),
    [email, account?.id],
  )
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useInfiniteList(load)
  const visible = useMemo(() => filterUsers(items, { name, email: emailInput }), [items, name, emailInput])
  const summary = useMemo(() => summarizeUserFilters({ name, email: emailInput }, account?.name), [name, emailInput, account?.name])

  // Nome filtrado no aparelho: com poucos visíveis e mais páginas no servidor, busca a próxima sozinho (com limite).
  const autoLoadedRef = useRef(0)
  useEffect(() => {
    autoLoadedRef.current = 0
  }, [name, email, account?.id])
  useEffect(() => {
    const busy = loading || refreshing || loadingMore
    if (shouldAutoLoadMore({ filters: { name }, visible: visible.length, hasMore, busy, autoLoaded: autoLoadedRef.current })) {
      autoLoadedRef.current += 1
      void loadMore()
    }
  }, [name, visible.length, hasMore, loading, refreshing, loadingMore, loadMore])

  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
  }

  function clearFilters() {
    setName('')
    setEmailInput('')
    setAccount(null)
  }

  return (
    <YStack flex={1} bg="appBg">
      <YStack px={20} pt={12} pb={8} gap={12}>
        <OfflineNotice message="Sem internet. Usuários precisam de conexão para listar, criar e excluir." />
        <XStack items="center" gap={12}>
          <XStack
            flex={1}
            minH={TOQUE_MINIMO}
            items="center"
            justify="center"
            rounded={16}
            bg="brandPrimary"
            opacity={{ press: 0.85 }}
            onPress={() => router.push('/configuracoes/usuarios/nova')}
            accessibilityRole="button"
            accessibilityLabel="Novo usuário">
            <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
              Novo usuário
            </Text>
          </XStack>
          <FilterToggle open={filtersOpen} activeCount={summary.activeCount} onPress={() => toggleFilters()} />
        </XStack>
        <CollapsibleFilters
          open={filtersOpen}
          summary={summary.text}
          onOpen={() => toggleFilters(true)}
          onClear={clearFilters}
          clearable={summary.activeCount > 0}>
          <AccountPicker label="Conta" value={account?.id ?? ''} selected={account} placeholder="Todas as contas" onChange={setAccount} />
          <TextFilterField label="Nome" value={name} placeholder="Buscar pelo nome" onChange={setName} />
          <TextFilterField label="E-mail" value={emailInput} placeholder="Buscar pelo e-mail" keyboardType="email-address" onChange={setEmailInput} />
        </CollapsibleFilters>
      </YStack>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id || item.email}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1, gap: 12 }}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => {
          if (hasMore && !loading && !refreshing && !loadingMore) void loadMore()
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <ListLoadingFooter />
          ) : hasMore && name.trim() && !loading && !error ? (
            // Limite de carregamento automático atingido (filtro de nome no aparelho): o admin pede mais.
            <Text
              fontSize={16}
              fontWeight="800"
              color="brandFg"
              textDecorationLine="underline"
              style={{ textAlign: 'center', paddingVertical: 12 }}
              onPress={() => void loadMore()}
              accessibilityRole="button"
              accessibilityLabel="Buscar mais usuários">
              Buscar mais usuários
            </Text>
          ) : undefined
        }
        ListEmptyComponent={
          <ListStatus
            loading={loading || (loadingMore && visible.length === 0)}
            error={error}
            empty={!loading && !error && !(loadingMore && visible.length === 0)}
            emptyTitle="Nenhum usuário"
            emptyMessage={summary.activeCount > 0 ? 'Nenhum usuário com esses filtros.' : 'Cadastre o primeiro usuário da conta.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => (
          <UserRow
            user={item}
            self={item.id === currentUserId}
            chevron={iconColor}
            // Quem cadastrou: só quando a API enviar `createdBy` (campo ausente = esconder).
            author={item.createdBy !== undefined ? authorLine(item.createdBy, 'user') : undefined}
          />
        )}
      />
    </YStack>
  )
}

function UsuariosList({ currentUserId, isAdmin }: { currentUserId: string | null; isAdmin: boolean }) {
  const isDark = useColorScheme() === 'dark'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [account, setAccount] = useState<Account | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), USERS_CONTRACT.searchDebounceMs)
    return () => clearTimeout(timer)
  }, [input])

  // Master: o backend limita à própria conta. Admin: todas, ou a conta escolhida.
  const load = useCallback(
    (paging: ListPagingRequest) =>
      listUsers({ ...paging, search: search || undefined, accountId: isAdmin ? account?.id : undefined }),
    [search, isAdmin, account?.id],
  )
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useInfiniteList(load)

  return (
    <YStack flex={1} bg="appBg">
      <YStack px={20} pt={12} pb={8} gap={12}>
        <OfflineNotice message="Sem internet. Usuários precisam de conexão para listar, criar e excluir." />
        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          rounded={16}
          bg="brandPrimary"
          opacity={{ press: 0.85 }}
          onPress={() => router.push('/configuracoes/usuarios/nova')}
          accessibilityRole="button"
          accessibilityLabel="Novo usuário">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Novo usuário
          </Text>
        </XStack>
        {isAdmin ? (
          <YStack gap={6}>
            <AccountPicker
              label="Conta"
              value={account?.id ?? ''}
              selected={account}
              placeholder="Todas as contas"
              onChange={setAccount}
            />
            {account ? (
              <Text
                fontSize={16}
                fontWeight="800"
                color="brandFg"
                textDecorationLine="underline"
                onPress={() => setAccount(null)}
                accessibilityRole="button"
                accessibilityLabel="Mostrar todas as contas">
                Mostrar todas as contas
              </Text>
            ) : null}
          </YStack>
        ) : null}
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
            placeholder="Buscar por nome ou email"
            placeholderTextColor="brandMuted"
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Buscar usuário por nome ou email"
          />
          {input ? (
            <XStack
              minH={TOQUE_MINIMO}
              items="center"
              justify="center"
              style={{ width: 44 }}
              onPress={() => setInput('')}
              accessibilityRole="button"
              accessibilityLabel="Limpar busca">
              <Ionicons name="close-circle" size={22} color={iconColor} />
            </XStack>
          ) : null}
        </XStack>
      </YStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.email}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1, gap: 12 }}
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
            emptyTitle="Nenhum usuário"
            emptyMessage={search ? 'Nenhum usuário encontrado com essa busca.' : 'Cadastre o primeiro usuário da conta.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => <UserRow user={item} self={item.id === currentUserId} chevron={iconColor} />}
      />
    </YStack>
  )
}

function UserRow({ user, self, chevron, author }: { user: AccountUser; self: boolean; chevron: string; author?: string }) {
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
        onPress={() => router.push({ pathname: '/configuracoes/usuarios/[id]', params: { id: user.id, q: user.email } })}
        accessibilityRole="button"
        accessibilityLabel={`${user.name}${self ? ' (você)' : ''}, ${user.email}`}>
        <YStack flex={1} gap={4}>
          <Text fontSize={18} fontWeight="800" color="brandFg">
            {user.name || 'Sem nome'}
          </Text>
          <Text fontSize={16} fontWeight="500" color="brandMuted">
            {user.email}
          </Text>
          {author ? (
            <Text fontSize={15} fontWeight="600" color="brandMuted" numberOfLines={1}>
              {author}
            </Text>
          ) : null}
          <XStack mt={4}>
            <RoleBadge role={user.role} self={self} status={userStatusLabel(user)} />
          </XStack>
        </YStack>
        <Ionicons name="chevron-forward" size={22} color={chevron} />
      </XStack>
    </AppCard>
  )
}
