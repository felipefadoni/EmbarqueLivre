import Ionicons from '@expo/vector-icons/Ionicons'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { ScrollView, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'

import { AppCard } from '@/components/dashboard/AppCard'
import { useAuth } from '@/features/auth/AuthProvider'
import { TOQUE_MINIMO } from '../../../../tamagui.config'

const VERSAO = Constants.expoConfig?.version ?? '1.0.0'

export default function ConfiguracoesScreen() {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  const { user, logout } = useAuth()
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'

  return (
    <YStack flex={1} bg="appBg">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 28,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}>
        <YStack gap={4} minH={56} justify="center">
          <Text fontSize={28} fontWeight="800" color="brandFg">
            Configurações
          </Text>
          <Text fontSize={16} fontWeight="600" color="brandMuted">
            Cadastros, conta e saída do aplicativo.
          </Text>
        </YStack>

        <AppCard padded={false}>
          <YStack>
            <XStack items="center" justify="space-between" px={20} py={16} minH={TOQUE_MINIMO} gap={12}>
              <YStack flex={1} gap={4}>
                <Text fontSize={14} fontWeight="700" color="brandMuted">
                  Conta
                </Text>
                <Text fontSize={18} fontWeight="800" color="brandFg">
                  {user?.name ?? 'Conta'}
                </Text>
                <Text fontSize={16} fontWeight="500" color="brandMuted">
                  {user?.email ?? ''}
                </Text>
              </YStack>
              <Ionicons name="person-circle-outline" size={36} color={chevron} />
            </XStack>
            <YStack h={1} bg={isDark ? '#3A5247' : '#EEF6EF'} mx={20} />
            <XStack items="center" justify="space-between" px={20} py={16} minH={TOQUE_MINIMO} gap={12}>
              <YStack flex={1} gap={4}>
                <Text fontSize={18} fontWeight="800" color="brandFg">
                  Sobre
                </Text>
                <Text fontSize={16} fontWeight="500" color="brandMuted">
                  Embarque Livre · versão {VERSAO}
                </Text>
              </YStack>
              <Ionicons name="information-circle-outline" size={28} color={chevron} />
            </XStack>
          </YStack>
        </AppCard>

        <AppCard padded={false}>
          <YStack>
            <MenuLink href="/configuracoes/fazendas" icon="home-outline" label="Fazendas" chevron={chevron} />
            <YStack h={1} bg={isDark ? '#3A5247' : '#EEF6EF'} mx={20} />
            <MenuLink href="/configuracoes/vacinas" icon="medkit-outline" label="Vacinas" chevron={chevron} />
            <YStack h={1} bg={isDark ? '#3A5247' : '#EEF6EF'} mx={20} />
            <MenuLink
              href="/configuracoes/tipos-de-animais"
              icon="paw-outline"
              label="Tipos de animais"
              chevron={chevron}
            />
            <YStack h={1} bg={isDark ? '#3A5247' : '#EEF6EF'} mx={20} />
            <MenuLink href="/configuracoes/animais" icon="list-outline" label="Animais" chevron={chevron} />
          </YStack>
        </AppCard>

        <AppCard padded={false}>
          <XStack
            items="center"
            justify="space-between"
            px={20}
            py={16}
            minH={TOQUE_MINIMO}
            opacity={{ press: 0.85 }}
            onPress={() => {
              void logout()
            }}
            accessibilityRole="button"
            accessibilityLabel="Sair da conta">
            <Text fontSize={18} fontWeight="800" color="brandError">
              Sair
            </Text>
            <Ionicons name="log-out-outline" size={26} color={isDark ? '#FF8A80' : '#8B1515'} />
          </XStack>
        </AppCard>
      </ScrollView>
    </YStack>
  )
}


function MenuLink({
  href,
  icon,
  label,
  chevron,
}: {
  href: '/configuracoes/fazendas' | '/configuracoes/vacinas' | '/configuracoes/tipos-de-animais' | '/configuracoes/animais'
  icon: keyof typeof Ionicons.glyphMap
  label: string
  chevron: string
}) {
  return (
    <XStack
      items="center"
      justify="space-between"
      px={20}
      py={16}
      minH={TOQUE_MINIMO}
      gap={12}
      opacity={{ press: 0.85 }}
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <XStack items="center" gap={12} flex={1}>
        <Ionicons name={icon} size={24} color={chevron} />
        <Text fontSize={18} fontWeight="800" color="brandFg">
          {label}
        </Text>
      </XStack>
      <Ionicons name="chevron-forward" size={22} color={chevron} />
    </XStack>
  )
}
