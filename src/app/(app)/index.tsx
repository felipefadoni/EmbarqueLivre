import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { Pressable, ScrollView, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'

import { AppCard } from '@/components/dashboard/AppCard'
import { ProgressRing } from '@/components/dashboard/ProgressRing'
import { WeekChart } from '@/components/dashboard/WeekChart'
import {
  DASHBOARD_PLACEHOLDER,
  formatarDataCurta,
  iniciaisDoNome,
  primeiroNome,
  saudacaoAgora,
  type PeriodoGrafico,
} from '@/data/dashboardPlaceholder'
import { useAuth } from '@/features/auth/AuthProvider'

const PERIODOS: { id: PeriodoGrafico; label: string }[] = [
  { id: 'dia', label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
]

export default function DashboardScreen() {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  const { user } = useAuth()
  const [periodo, setPeriodo] = useState<PeriodoGrafico>('semana')

  const nome = primeiroNome(user?.name)
  const iniciais = iniciaisDoNome(user?.name)
  const embarque = DASHBOARD_PLACEHOLDER.proximoEmbarque
  const resumo = DASHBOARD_PLACEHOLDER.resumo
  const valores = DASHBOARD_PLACEHOLDER.embarquesPorPeriodo[periodo]
  const ink = isDark ? '#D1EFEF' : '#2B3D34'
  const muted = isDark ? '#CEE3CD' : '#3A5247'
  const ringTrack = isDark ? '#3A5247' : '#CEE3CD'
  const ringColor = isDark ? '#99C2AB' : '#1C3C31'
  const grid = isDark ? '#3A5247' : '#E2EEE4'
  const fill = isDark ? 'rgba(153, 194, 171, 0.22)' : 'rgba(153, 194, 171, 0.35)'
  const pillBg = isDark ? '#99C2AB' : '#1C3C31'
  const pillFg = isDark ? '#2B3D34' : '#FFFFFF'

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
        <XStack items="center" justify="space-between" minH={56}>
          <XStack items="center" gap={12} flex={1}>
            <YStack
              w={56}
              h={56}
              rounded={28}
              bg="brandSage"
              items="center"
              justify="center"
              accessibilityLabel={`Avatar de ${user?.name ?? 'produtor'}`}>
              <Text fontSize={18} fontWeight="800" color="brandInk">
                {iniciais}
              </Text>
            </YStack>
            <YStack flex={1}>
              <Text fontSize={15} fontWeight="600" color="brandMuted">
                {saudacaoAgora()},
              </Text>
              <Text fontSize={26} fontWeight="800" color="brandFg" lineHeight="32px">
                {nome}
              </Text>
            </YStack>
          </XStack>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notificações"
            hitSlop={6}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: isDark ? '#243B32' : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#1C3C31',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.3 : 0.08,
              shadowRadius: 8,
              elevation: 2,
            }}>
            <Ionicons name="notifications-outline" size={24} color={ink} />
          </Pressable>
        </XStack>

        <AppCard>
          <XStack items="center" justify="space-between" gap={12} flexWrap="wrap">
            <YStack flex={1} gap={8} minW={160}>
              <Text fontSize={15} fontWeight="700" color="brandMuted">
                Próximo embarque
              </Text>
              <Text fontSize={22} fontWeight="800" color="brandFg">
                {embarque.fazenda}
              </Text>
              <Text fontSize={16} fontWeight="600" color="brandMuted">
                {formatarDataCurta(embarque.dataIso)} · {embarque.cabecas} cabeças
              </Text>
              <YStack
                self="flex-start"
                px={14}
                py={8}
                rounded={999}
                minH={36}
                justify="center"
                style={{ backgroundColor: pillBg }}>
                <Text fontSize={14} fontWeight="800" color={pillFg}>
                  Em {embarque.diasParaEmbarque} dias
                </Text>
              </YStack>
            </YStack>
            <ProgressRing
              size={128}
              strokeWidth={12}
              progress={embarque.score / 100}
              color={ringColor}
              trackColor={ringTrack}>
              <YStack items="center">
                <Text fontSize={28} fontWeight="800" color="brandFg">
                  {embarque.score}
                </Text>
                <Text fontSize={13} fontWeight="700" color="brandMuted">
                  / {embarque.total}
                </Text>
              </YStack>
            </ProgressRing>
          </XStack>
        </AppCard>

        <XStack gap={10} w="100%">
          <StatusCard label="Liberados" value={resumo.liberados} background="liberado" color="liberado-color" />
          <StatusCard label="Em carência" value={resumo.emCarencia} background="bloqueado" color="bloqueado-color" />
          <StatusCard label="Sem histórico" value={resumo.semHistorico} background="sem-historico" color="sem-historico-color" />
        </XStack>

        <AppCard>
          <YStack gap={14}>
            <Text fontSize={20} fontWeight="800" color="brandFg">
              Embarques da semana
            </Text>
            <XStack bg={isDark ? '#1C3C31' : '#EEF6EF'} rounded={999} p={4} gap={4}>
              {PERIODOS.map((item) => {
                const ativo = item.id === periodo
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setPeriodo(item.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ativo }}
                    accessibilityLabel={`Ver gráfico por ${item.label}`}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: ativo ? (isDark ? '#99C2AB' : '#2B3D34') : 'transparent',
                    }}>
                    <Text
                      fontSize={15}
                      fontWeight="800"
                      color={ativo ? (isDark ? '#2B3D34' : '#FFFFFF') : muted}>
                      {item.label}
                    </Text>
                  </Pressable>
                )
              })}
            </XStack>
            <WeekChart
              values={valores}
              color={ringColor}
              gridColor={grid}
              labelColor={muted}
              fillColor={fill}
            />
          </YStack>
        </AppCard>
      </ScrollView>
    </YStack>
  )
}

function StatusCard({
  label,
  value,
  background,
  color,
}: {
  label: string
  value: number
  background: 'liberado' | 'bloqueado' | 'sem-historico'
  color: 'liberado-color' | 'bloqueado-color' | 'sem-historico-color'
}) {
  return (
    <YStack
      flex={1}
      rounded={20}
      bg={background}
      p={14}
      minH={96}
      justify="space-between"
      accessibilityLabel={`${label}: ${value}`}>
      <Text fontSize={14} fontWeight="800" color={color} lineHeight="18px">
        {label}
      </Text>
      <Text fontSize={28} fontWeight="800" color={color}>
        {value}
      </Text>
    </YStack>
  )
}
