import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import type { Farm } from '@/api/catalog'
import { AppCard } from '@/components/dashboard/AppCard'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { labelUf } from '@/constants/ufs'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { useLocalList } from '@/sync/hooks'
import { farmsListQuery, rowToFarm } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

export default function FazendasListScreen() {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const { user } = useAuth()
  const canManage = canManageCatalog(user?.role)
  // Lista local reativa (PowerSync): funciona offline e atualiza sozinha quando o sync traz dados.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useLocalList(farmsListQuery, rowToFarm, [])

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
          onPress={() => router.push('/configuracoes/fazendas/nova')}
          accessibilityRole="button"
          accessibilityLabel="Nova fazenda">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Nova fazenda
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
            emptyTitle="Nenhuma fazenda"
            emptyMessage={canManage ? 'Cadastre a primeira fazenda para começar.' : 'Ainda não há fazendas cadastradas.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => <FarmRow farm={item} chevron={chevron} canManage={canManage} />}
      />
    </YStack>
  )
}

function FarmRow({ farm, chevron, canManage }: { farm: Farm; chevron: string; canManage: boolean }) {
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
        onPress={canManage ? () => router.push(`/configuracoes/fazendas/${farm.id}`) : undefined}
        accessibilityRole={canManage ? 'button' : undefined}
        accessibilityLabel={canManage ? `Editar fazenda ${farm.name}` : farm.name}>
        <YStack flex={1} gap={4}>
          <Text fontSize={18} fontWeight="800" color="brandFg">
            {farm.name}
          </Text>
          <Text fontSize={16} fontWeight="500" color="brandMuted">
            {farm.city} · {labelUf(farm.state)}
          </Text>
        </YStack>
        {canManage ? <Ionicons name="chevron-forward" size={22} color={chevron} /> : null}
      </XStack>
    </AppCard>
  )
}
