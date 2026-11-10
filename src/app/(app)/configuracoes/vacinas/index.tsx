import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import { vaccinesApi, type Vaccine } from '@/api/catalog'
import { paginationParams, type ListPagingRequest } from '@/api/contract'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { AppCard } from '@/components/dashboard/AppCard'
import { useInfiniteList } from '@/features/cadastros/useInfiniteList'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

function carenciaLabel(days: number) {
  return days === 1 ? '1 dia de carência' : `${days} dias de carência`
}

export default function VacinasListScreen() {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const { user } = useAuth()
  const canManage = canManageCatalog(user?.role)
  const load = useCallback((paging: ListPagingRequest) => vaccinesApi.list(paginationParams(paging)), [])
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useInfiniteList(load)

  return (
    <YStack flex={1} bg="appBg">
      {canManage ? (
      <YStack px={20} pt={12} pb={8}>
        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          rounded={16}
          bg="brandPrimary"
          opacity={{ press: 0.85 }}
          onPress={() => router.push('/configuracoes/vacinas/nova')}
          accessibilityRole="button"
          accessibilityLabel="Nova vacina">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Nova vacina
          </Text>
        </XStack>
      </YStack>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.name}
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
            emptyTitle="Nenhuma vacina"
            emptyMessage={canManage ? 'Cadastre a primeira vacina e os dias de carência.' : 'Ainda não há vacinas cadastradas.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => <VaccineRow vaccine={item} chevron={chevron} canManage={canManage} />}
      />
    </YStack>
  )
}

function VaccineRow({ vaccine, chevron, canManage }: { vaccine: Vaccine; chevron: string; canManage: boolean }) {
  return (
    <AppCard padded={false}>
      <XStack
        items="center"
        justify="space-between"
        px={20}
        py={16}
        minH={TOQUE_MINIMO}
        gap={12}
        opacity={canManage ? { press: 0.85 } : undefined}
        onPress={canManage ? () => router.push(`/configuracoes/vacinas/${vaccine.id}`) : undefined}
        accessibilityRole={canManage ? 'button' : undefined}
        accessibilityLabel={canManage ? `Editar vacina ${vaccine.name}` : vaccine.name}>
        <YStack flex={1} gap={4}>
          <Text fontSize={18} fontWeight="800" color="brandFg">
            {vaccine.name}
          </Text>
          <Text fontSize={16} fontWeight="500" color="brandMuted">
            {carenciaLabel(vaccine.withdrawalDays)}
          </Text>
        </YStack>
        {canManage ? <Ionicons name="chevron-forward" size={22} color={chevron} /> : null}
      </XStack>
    </AppCard>
  )
}
