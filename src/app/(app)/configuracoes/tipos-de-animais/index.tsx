import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { FlatList, useColorScheme } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import type { AnimalType } from '@/api/catalog'
import { ListLoadingFooter, ListStatus } from '@/components/cadastros/ListStatus'
import { AppCard } from '@/components/dashboard/AppCard'
import { canManageAnimalTypes, canViewAnimalTypes } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { useLocalList } from '@/sync/hooks'
import { animalTypesListQuery, rowToAnimalType } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

export default function TiposDeAnimaisListScreen() {
  const { user } = useAuth()
  if (!canViewAnimalTypes(user?.role)) return <Redirect href="/configuracoes" />
  return <TiposDeAnimaisList />
}

function TiposDeAnimaisList() {
  const isDark = useColorScheme() === 'dark'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'
  const { user } = useAuth()
  const canManage = canManageAnimalTypes(user?.role)
  // Lista local reativa (PowerSync): funciona offline e atualiza sozinha quando o sync traz dados.
  const { items, loading, refreshing, loadingMore, error, hasMore, reload, refresh, loadMore } = useLocalList(animalTypesListQuery, rowToAnimalType, [])

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
          onPress={() => router.push('/configuracoes/tipos-de-animais/nova')}
          accessibilityRole="button"
          accessibilityLabel="Novo tipo de animal">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Novo tipo
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
            emptyTitle="Nenhum tipo de animal"
            emptyMessage={canManage ? 'Os tipos padrão (Bovina, Suína, Ovina e Caprina) chegam na sincronização. Você também pode cadastrar outros tipos.' : 'Ainda não há tipos de animais cadastrados.'}
            onRetry={() => void reload()}
          />
        }
        renderItem={({ item }) => <TypeRow item={item} chevron={chevron} canManage={canManage} />}
      />
    </YStack>
  )
}

function TypeRow({ item, chevron, canManage }: { item: AnimalType; chevron: string; canManage: boolean }) {
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
        onPress={canManage ? () => router.push(`/configuracoes/tipos-de-animais/${item.id}`) : undefined}
        accessibilityRole={canManage ? 'button' : undefined}
        accessibilityLabel={canManage ? `Editar tipo ${item.name}` : item.name}>
        <Text fontSize={18} fontWeight="800" color="brandFg" flex={1}>
          {item.name}
        </Text>
        {canManage ? <Ionicons name="chevron-forward" size={22} color={chevron} /> : null}
      </XStack>
    </AppCard>
  )
}
