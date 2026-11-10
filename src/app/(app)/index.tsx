import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { isWithdrawalActive } from '@/api/contract'
import { SelectField } from '@/components/cadastros/SelectField'
import { WithdrawalBadge } from '@/components/cadastros/WithdrawalBadge'
import { AppCard } from '@/components/dashboard/AppCard'
import { BarList } from '@/components/dashboard/BarList'
import { ProgressRing } from '@/components/dashboard/ProgressRing'
import { ShortListCard, ShortListRow } from '@/components/dashboard/ShortListCard'
import { StatusCard } from '@/components/dashboard/StatusCard'
import { WeekChart } from '@/components/dashboard/WeekChart'
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatDatePtBr, formatDayMonthPtBr } from '@/features/cadastros/dates'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { aptosHints, iniciaisDoNome, primeiroNome, saudacaoAgora, textoLiberados } from '@/features/dashboard/format'
import { animalsLink, vaccinationsLink } from '@/features/dashboard/links'
import type { ChartPeriod } from '@/features/dashboard/period'
import { useDashboard } from '@/features/dashboard/useDashboard'
import { useToday } from '@/features/dashboard/useToday'
import { useLocalFarms, useSyncInfo } from '@/sync/hooks'

const PERIODOS: { id: ChartPeriod; label: string }[] = [
  { id: 'dia', label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
]

export default function DashboardScreen() {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  const { user } = useAuth()
  const canManage = canManageCatalog(user?.role)
  const today = useToday()
  const farms = useLocalFarms()
  const sync = useSyncInfo()
  const [chosenFarmId, setFarmId] = useState('')
  const [periodo, setPeriodo] = useState<ChartPeriod>('dia')
  // Fazenda escolhida sumiu no sync (ou trocou o usuário): vale "Todas".
  const farmId = chosenFarmId && farms.some((item) => item.id === chosenFarmId) ? chosenFarmId : ''
  const farm = farmId || undefined
  const data = useDashboard({ today, farmId: farm, period: periodo })
  const { situation } = data

  const ringTrack = isDark ? '#3A5247' : '#CEE3CD'
  const ringColor = isDark ? '#99C2AB' : '#1C3C31'
  const muted = isDark ? '#CEE3CD' : '#3A5247'
  const grid = isDark ? '#3A5247' : '#E2EEE4'
  const fill = isDark ? 'rgba(153, 194, 171, 0.22)' : 'rgba(153, 194, 171, 0.35)'
  const chevron = isDark ? '#A8B8AF' : '#7A8B80'

  // Banco ainda vazio porque não baixou nada: não mostrar "zero animais".
  const firstSync = !sync.hasSynced && farms.length === 0 && situation.total === 0
  const noFarms = !firstSync && !data.loading && data.farms === 0
  const noAnimals = !firstSync && !noFarms && !data.loading && situation.total === 0
  const showNumbers = !firstSync && !noFarms && !noAnimals
  const farmName = farm ? farms.find((item) => item.id === farm)?.name : undefined

  return (
    <YStack flex={1} bg="appBg">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}
        showsVerticalScrollIndicator={false}>
        {/* 1. Cabeçalho */}
        <XStack items="center" gap={12} minH={56}>
          <YStack w={56} h={56} rounded={28} bg="brandSage" items="center" justify="center" accessibilityLabel={`Avatar de ${user?.name ?? 'produtor'}`}>
            <Text fontSize={18} fontWeight="800" color="brandInk">
              {iniciaisDoNome(user?.name)}
            </Text>
          </YStack>
          <YStack flex={1}>
            <Text fontSize={15} fontWeight="600" color="brandMuted">
              {saudacaoAgora()},
            </Text>
            <Text fontSize={26} fontWeight="800" color="brandFg" lineHeight="32px">
              {primeiroNome(user?.name)}
            </Text>
          </YStack>
        </XStack>
        <SyncStatusIndicator compact />
        {farms.length > 1 ? (
          <SelectField
            label="Fazenda"
            value={farmId}
            options={[{ value: '', label: 'Todas as fazendas' }, ...farms.map((item) => ({ value: item.id, label: item.name }))]}
            onChange={setFarmId}
          />
        ) : null}

        {firstSync ? (
          <AppCard>
            <XStack items="center" gap={12} minH={64}>
              <Spinner color="brandPrimary" />
              <Text fontSize={17} fontWeight="700" color="brandFg" flex={1}>
                Baixando seus dados…
              </Text>
            </XStack>
          </AppCard>
        ) : null}

        {noFarms ? (
          <EmptyCta
            title="Comece cadastrando uma fazenda"
            message={canManage ? 'Depois cadastre os animais e lance as vacinas.' : 'Peça ao responsável da conta para cadastrar as fazendas.'}
            action={canManage ? { label: 'Cadastrar fazenda', onPress: () => router.push('/configuracoes/fazendas/nova') } : undefined}
          />
        ) : null}
        {noAnimals ? (
          <EmptyCta
            title={farmName ? `Nenhum animal em ${farmName}` : 'Cadastre seus animais'}
            message="Com os animais cadastrados, o painel mostra quem está liberado para embarque."
            action={{ label: 'Cadastrar animal', onPress: () => router.push('/configuracoes/animais/nova') }}
          />
        ) : null}

        {showNumbers ? (
          <>
            {/* 2. Aptos para embarque hoje (= liberados; sem histórico NÃO é apto) */}
            <AppCard>
              <XStack
                items="center"
                justify="space-between"
                gap={12}
                flexWrap="wrap"
                opacity={{ press: 0.85 }}
                onPress={() => router.push(animalsLink({ situacao: 'liberado', farmId: farm }))}
                accessibilityRole="button"
                accessibilityLabel={`Aptos para embarque hoje: ${textoLiberados(situation.liberados, situation.total)}. Ver animais liberados`}>
                <YStack flex={1} gap={8} minW={160}>
                  <Text fontSize={15} fontWeight="700" color="brandMuted">
                    Aptos para embarque hoje
                  </Text>
                  <Text fontSize={22} fontWeight="800" color="brandFg">
                    {textoLiberados(situation.liberados, situation.total)}
                  </Text>
                  {aptosHints(situation, Boolean(farmName)).map((hint) => (
                    <Text key={hint} fontSize={15} fontWeight="600" color="brandMuted">
                      {hint}
                    </Text>
                  ))}
                </YStack>
                <ProgressRing
                  size={120}
                  strokeWidth={12}
                  progress={situation.total ? situation.liberados / situation.total : 0}
                  color={ringColor}
                  trackColor={ringTrack}>
                  <YStack items="center">
                    <Text fontSize={28} fontWeight="800" color="brandFg">
                      {situation.liberados}
                    </Text>
                    <Text fontSize={13} fontWeight="700" color="brandMuted">
                      / {situation.total}
                    </Text>
                  </YStack>
                </ProgressRing>
              </XStack>
            </AppCard>

            {/* 3. Situação */}
            <XStack gap={10} w="100%">
              <StatusCard label="Liberados" value={situation.liberados} tone="liberado" onPress={() => router.push(animalsLink({ situacao: 'liberado', farmId: farm }))} />
              <StatusCard label="Em carência" value={situation.emCarencia} tone="bloqueado" onPress={() => router.push(animalsLink({ situacao: 'carencia', farmId: farm }))} />
              <StatusCard label="Sem histórico" value={situation.semHistorico} tone="sem-historico" onPress={() => router.push(animalsLink({ situacao: 'sem_historico', farmId: farm }))} />
            </XStack>

            {/* 4. Ficam livres nos próximos 7 dias */}
            <ShortListCard
              title="Ficam livres nos próximos 7 dias"
              loading={data.releasing.loading}
              empty={data.releasing.items.length === 0}
              emptyText="Nenhum animal sai da carência nos próximos 7 dias."
              footerLabel={`Ver todos (${situation.libera7})`}
              onFooterPress={() => router.push(animalsLink({ situacao: 'libera7', farmId: farm }))}>
              {data.releasing.items.map((item) => (
                <ShortListRow key={item.id} onPress={() => router.push(`/configuracoes/animais/${item.id}`)} label={`Animal ${item.code}, livre em ${formatDatePtBr(item.freeAt)}`}>
                  <YStack flex={1} gap={2}>
                    <Text fontSize={17} fontWeight="800" color="brandFg">
                      {item.code}
                    </Text>
                    <Text fontSize={14} fontWeight="600" color="brandMuted">
                      {item.farmName ?? 'Fazenda não informada'}
                    </Text>
                  </YStack>
                  <WithdrawalBadge active activeLabel={`Livre em ${formatDayMonthPtBr(item.freeAt)}`} inactiveLabel="Livre" />
                  <Ionicons name="chevron-forward" size={20} color={chevron} />
                </ShortListRow>
              ))}
            </ShortListCard>
          </>
        ) : null}

        {!firstSync && !noFarms ? (
          <>
            {/* 5. Vacinações aplicadas */}
            <AppCard>
              <YStack gap={14}>
                <Text fontSize={20} fontWeight="800" color="brandFg">
                  Vacinações aplicadas
                </Text>
                <XStack gap={10}>
                  <CountTile label="Hoje" value={data.counts.hoje} onPress={() => router.push(vaccinationsLink({ date: today, farmId: farm }))} />
                  <CountTile label="Semana" value={data.counts.semana} onPress={() => router.push(vaccinationsLink({ farmId: farm }))} />
                  <CountTile label="Mês" value={data.counts.mes} onPress={() => router.push(vaccinationsLink({ farmId: farm }))} />
                </XStack>
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
                        <Text fontSize={15} fontWeight="800" color={ativo ? (isDark ? '#2B3D34' : '#FFFFFF') : muted}>
                          {item.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </XStack>
                <WeekChart values={data.series.values} labels={data.series.labels} color={ringColor} gridColor={grid} labelColor={muted} fillColor={fill} />
                {data.counts.mes === 0 && !data.counts.loading ? (
                  <Text fontSize={15} fontWeight="600" color="brandMuted">
                    Nenhuma vacina lançada este mês.
                  </Text>
                ) : null}
              </YStack>
            </AppCard>

            {/* 6. Últimas vacinações */}
            <ShortListCard
              title="Últimas vacinações"
              loading={data.latest.loading}
              empty={data.latest.items.length === 0}
              emptyText='Nenhuma vacina lançada ainda. Toque em "Informar Vacina" na aba Vacinas.'
              footerLabel="Ver todas"
              onFooterPress={() => router.push(vaccinationsLink({ farmId: farm }))}>
              {data.latest.items.map((entry) => (
                <ShortListRow
                  key={entry.id}
                  onPress={() => router.push({ pathname: '/lancamentos/[id]', params: { id: entry.id } })}
                  label={`Lançamento do animal ${entry.animalCode}, ${entry.vaccineName}, ${formatDatePtBr(entry.appliedAt)}`}>
                  <YStack flex={1} gap={2}>
                    <Text fontSize={17} fontWeight="800" color="brandFg">
                      {entry.animalCode || 'Animal sem código'} · {entry.vaccineName || 'Vacina'}
                    </Text>
                    <Text fontSize={14} fontWeight="600" color="brandMuted">
                      {formatDatePtBr(entry.appliedAt)} · {entry.farmName || 'Fazenda não informada'}
                    </Text>
                  </YStack>
                  {entry.withdrawalUntil ? (
                    <WithdrawalBadge
                      active={isWithdrawalActive(entry.withdrawalUntil)}
                      activeLabel={`Livre em ${formatDayMonthPtBr(entry.withdrawalUntil)}`}
                      inactiveLabel="Livre"
                    />
                  ) : null}
                </ShortListRow>
              ))}
            </ShortListCard>

            {/* 7. Rebanho */}
            <AppCard>
              <YStack gap={14}>
                <Text fontSize={20} fontWeight="800" color="brandFg">
                  Rebanho
                </Text>
                <XStack gap={10}>
                  <CountTile label="Fazendas" value={farm ? 1 : data.farms} onPress={() => router.push('/configuracoes/fazendas')} />
                  <CountTile label="Animais" value={situation.total} onPress={() => router.push(animalsLink({ farmId: farm }))} />
                </XStack>
                {data.byType.items.length > 0 ? (
                  <YStack gap={6}>
                    <Text fontSize={16} fontWeight="800" color="brandMuted">
                      Por tipo
                    </Text>
                    <BarList
                      color={ringColor}
                      track={ringTrack}
                      items={data.byType.items.map((row) => ({
                        id: row.id ?? '',
                        label: row.name ?? 'Tipo não informado',
                        value: Number(row.n),
                        hint: Number(row.emCarencia) > 0 ? `${row.emCarencia} em carência` : undefined,
                      }))}
                      onPress={(item) => router.push(animalsLink({ animalTypeId: item.id || undefined, farmId: farm }))}
                    />
                  </YStack>
                ) : null}
                {!farm && data.byFarm.items.length > 1 ? (
                  <YStack gap={6}>
                    <Text fontSize={16} fontWeight="800" color="brandMuted">
                      Por fazenda
                    </Text>
                    <BarList
                      color={ringColor}
                      track={ringTrack}
                      items={data.byFarm.items.map((row) => ({
                        id: row.id ?? '',
                        label: row.name ?? 'Fazenda',
                        value: Number(row.n),
                        hint: Number(row.emCarencia) > 0 ? `${row.emCarencia} em carência` : undefined,
                      }))}
                      onPress={(item) => item.id && setFarmId(item.id)}
                    />
                  </YStack>
                ) : null}
              </YStack>
            </AppCard>

            {/* 8. Vacina mais usada (30 dias) */}
            <AppCard>
              <XStack
                items="center"
                gap={12}
                minH={56}
                opacity={{ press: 0.85 }}
                onPress={() => router.push('/configuracoes/vacinas')}
                accessibilityRole="button"
                accessibilityLabel={
                  data.topVaccine.item
                    ? `Vacina mais usada nos últimos 30 dias: ${data.topVaccine.item.name}, ${data.topVaccine.item.n} aplicações`
                    : 'Nenhuma vacina aplicada nos últimos 30 dias'
                }>
                <Ionicons name="medkit-outline" size={26} color={ringColor} />
                <YStack flex={1} gap={2}>
                  <Text fontSize={15} fontWeight="700" color="brandMuted">
                    Vacina mais usada (30 dias)
                  </Text>
                  <Text fontSize={18} fontWeight="800" color="brandFg">
                    {data.topVaccine.item
                      ? `${data.topVaccine.item.name ?? 'Vacina'} · ${data.topVaccine.item.n} ${Number(data.topVaccine.item.n) === 1 ? 'aplicação' : 'aplicações'}`
                      : 'Nenhuma aplicação nos últimos 30 dias'}
                  </Text>
                </YStack>
                <Ionicons name="chevron-forward" size={20} color={chevron} />
              </XStack>
            </AppCard>
          </>
        ) : null}
      </ScrollView>
    </YStack>
  )
}

function CountTile({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  return (
    <YStack
      flex={1}
      rounded={16}
      bg="brandSurface"
      p={12}
      minH={72}
      justify="space-between"
      opacity={onPress ? { press: 0.85 } : undefined}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}>
      <Text fontSize={14} fontWeight="800" color="brandMuted">
        {label}
      </Text>
      <Text fontSize={24} fontWeight="800" color="brandFg">
        {value}
      </Text>
    </YStack>
  )
}

function EmptyCta({ title, message, action }: { title: string; message: string; action?: { label: string; onPress: () => void } }) {
  return (
    <AppCard>
      <YStack gap={10}>
        <Text fontSize={20} fontWeight="800" color="brandFg">
          {title}
        </Text>
        <Text fontSize={16} fontWeight="600" color="brandMuted">
          {message}
        </Text>
        {action ? (
          <XStack
            minH={56}
            items="center"
            justify="center"
            rounded={16}
            bg="brandPrimary"
            opacity={{ press: 0.85 }}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}>
            <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
              {action.label}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </AppCard>
  )
}
