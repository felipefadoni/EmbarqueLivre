import { router } from 'expo-router'
import { Text, XStack, YStack } from 'tamagui'

import { formatWeightKg } from '@/api/shipmentsContract'
import { AuthorLines } from '@/components/cadastros/AuthorLines'
import { useKeysetList } from '@/sync/hooks'
import { formatWeighedAt, rowToWeighing, weighingsListSpec, type WeighingRow } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../tamagui.config'

/**
 * Histórico de peso no cadastro do animal: peso, data e hora e, para o admin, quem lançou.
 * Inclui as pesagens mesmo de animal que já saiu em embarque finalizado.
 */
export function WeightHistory({ animalId, showAuthor }: { animalId: string; showAuthor: boolean }) {
  const { items, loading, error } = useKeysetList(
    () => weighingsListSpec({ animalId, includeShipped: true, withAuthor: showAuthor }),
    (row: WeighingRow) => rowToWeighing(row),
    [animalId, showAuthor],
  )

  return (
    <YStack gap={12} mt={8}>
      <Text fontSize={19} fontWeight="800" color="brandFg">
        Peso
      </Text>
      {loading ? (
        <Text fontSize={16} fontWeight="500" color="brandMuted">
          Carregando o histórico de peso…
        </Text>
      ) : error ? (
        <Text fontSize={16} fontWeight="500" color="brandMuted">
          Histórico de peso indisponível no momento.
        </Text>
      ) : items.length === 0 ? (
        <Text fontSize={16} fontWeight="500" color="brandMuted">
          Nenhuma pesagem lançada para este animal.
        </Text>
      ) : (
        <YStack gap={10}>
          <Text fontSize={16} fontWeight="700" color="brandFg">
            {items.length === 1 ? '1 pesagem' : `${items.length} pesagens`}
          </Text>
          {items.map((weighing) => (
            <XStack
              key={weighing.id}
              bg="brandSurface"
              borderColor="brandBorder"
              borderWidth={2}
              rounded={16}
              p={14}
              gap={8}
              items="center"
              justify="space-between"
              minH={TOQUE_MINIMO}
              opacity={{ press: 0.85 }}
              onPress={() => router.push({ pathname: '/pesos/[id]', params: { id: weighing.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Pesagem de ${formatWeightKg(weighing.weightKg)}, em ${formatWeighedAt(weighing.weighedAt)}`}>
              <YStack flex={1} gap={4}>
                <Text fontSize={16} fontWeight="800" color="brandFg">
                  {formatWeightKg(weighing.weightKg)}
                </Text>
                <Text fontSize={15} fontWeight="600" color="brandMuted">
                  {formatWeighedAt(weighing.weighedAt) || 'Momento não informado'}
                </Text>
                {showAuthor ? <AuthorLines author={{ name: weighing.createdByName, email: weighing.createdByEmail }} /> : null}
              </YStack>
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  )
}
