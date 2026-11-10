import Constants from 'expo-constants'
import { ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, YStack } from 'tamagui'

import { AppCard } from '@/components/dashboard/AppCard'

const VERSAO = Constants.expoConfig?.version ?? '1.0.0'

export default function InfosScreen() {
  const insets = useSafeAreaInsets()

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
            Infos
          </Text>
          <Text fontSize={16} fontWeight="600" color="brandMuted">
            Regras de carência e informações do aplicativo.
          </Text>
        </YStack>

        <AppCard>
          <YStack gap={8}>
            <Text fontSize={20} fontWeight="800" color="brandFg">
              O que é carência?
            </Text>
            <Text fontSize={16} lineHeight="24px" fontWeight="500" color="brandFg">
              A carência é o prazo de retirada do medicamento após a última aplicação. O animal só pode
              embarcar quando esse prazo termina.
            </Text>
          </YStack>
        </AppCard>

        <AppCard>
          <YStack gap={8}>
            <Text fontSize={20} fontWeight="800" color="brandFg">
              Como a data de liberação é calculada
            </Text>
            <Text fontSize={16} lineHeight="24px" fontWeight="500" color="brandFg">
              A data de liberação é o dia da última aplicação mais os dias de carência. O dia da aplicação
              conta como dia 0.
            </Text>
          </YStack>
        </AppCard>

        <AppCard>
          <YStack gap={8}>
            <Text fontSize={20} fontWeight="800" color="brandFg">
              Prioridade dos status
            </Text>
            <Text fontSize={16} lineHeight="24px" fontWeight="500" color="brandFg">
              Em um lote, o status mais restritivo prevalece: bloqueado (em carência), depois sem histórico
              e, por último, liberado.
            </Text>
          </YStack>
        </AppCard>

        <AppCard>
          <YStack gap={8}>
            <Text fontSize={20} fontWeight="800" color="brandFg">
              Sobre o aplicativo
            </Text>
            <Text fontSize={16} lineHeight="24px" fontWeight="500" color="brandFg">
              O Embarque Livre ajuda a conferir a carência do gado de corte antes do embarque, mesmo no
              curral.
            </Text>
            <Text fontSize={16} fontWeight="700" color="brandMuted">
              Versão {VERSAO}
            </Text>
          </YStack>
        </AppCard>
      </ScrollView>
    </YStack>
  )
}
