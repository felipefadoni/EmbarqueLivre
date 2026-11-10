import { Text, XStack, YStack } from 'tamagui'

import type { AnimalWithdrawal, WithdrawalApplication } from '@/api/contract'
import { WithdrawalBadge } from '@/components/cadastros/WithdrawalBadge'
import { formatDatePtBr } from '@/features/cadastros/dates'

function pluralDias(days: number) {
  return days === 1 ? '1 dia' : `${days} dias`
}

function ApplicationRow({ item }: { item: WithdrawalApplication }) {
  return (
    <YStack bg="brandSurface" borderColor="brandBorder" borderWidth={2} rounded={16} p={14} gap={6}>
      <XStack items="center" justify="space-between" gap={8}>
        <Text fontSize={17} fontWeight="800" color="brandFg" flex={1}>
          {item.vaccineName || 'Vacina não informada'}
        </Text>
        <WithdrawalBadge active={item.active} activeLabel="Ativa" inactiveLabel="Encerrada" />
      </XStack>
      <Text fontSize={15} fontWeight="600" color="brandMuted">
        Aplicada em {formatDatePtBr(item.appliedAt) || '—'} · {pluralDias(item.withdrawalDays)} de carência
      </Text>
      <Text fontSize={15} fontWeight="700" color="brandFg">
        Livre em {formatDatePtBr(item.withdrawalUntil) || '—'}
      </Text>
    </YStack>
  )
}

/** Seção "Carência" do cadastro do animal, a partir do bloco `withdrawal` de GET /animals/:id. */
export function WithdrawalSection({ withdrawal }: { withdrawal: AnimalWithdrawal | null }) {
  return (
    <YStack gap={12} mt={8}>
      <Text fontSize={22} fontWeight="800" color="brandFg">
        Carência
      </Text>
      {withdrawal == null ? (
        <Text fontSize={16} lineHeight="24px" fontWeight="500" color="brandMuted">
          Informações de carência indisponíveis no momento.
        </Text>
      ) : (
        <>
          <YStack
            rounded={20}
            p={16}
            gap={4}
            bg={withdrawal.inWithdrawal ? 'bloqueado' : 'liberado'}
            accessibilityLiveRegion="polite">
            <Text fontSize={22} fontWeight="800" color={withdrawal.inWithdrawal ? 'bloqueado-color' : 'liberado-color'}>
              {withdrawal.inWithdrawal ? 'Em carência' : 'Livre'}
            </Text>
            <Text fontSize={17} fontWeight="700" color={withdrawal.inWithdrawal ? 'bloqueado-color' : 'liberado-color'}>
              {withdrawal.freeAt
                ? withdrawal.inWithdrawal
                  ? `Livre em ${formatDatePtBr(withdrawal.freeAt)}`
                  : `Livre desde ${formatDatePtBr(withdrawal.freeAt)}`
                : 'Nenhuma vacina aplicada'}
            </Text>
            <Text fontSize={15} fontWeight="600" color={withdrawal.inWithdrawal ? 'bloqueado-color' : 'liberado-color'}>
              Soma das carências (todas as vacinas): {pluralDias(withdrawal.totalWithdrawalDays)}
            </Text>
          </YStack>
          {withdrawal.applications.length === 0 ? (
            <Text fontSize={16} fontWeight="500" color="brandMuted">
              Nenhuma vacina aplicada neste animal.
            </Text>
          ) : (
            <YStack gap={10}>
              <Text fontSize={16} fontWeight="700" color="brandFg">
                Vacinas aplicadas ({withdrawal.applications.length})
              </Text>
              {withdrawal.applications.map((item, index) => (
                <ApplicationRow key={item.id || `${item.vaccineName}-${item.appliedAt}-${index}`} item={item} />
              ))}
            </YStack>
          )}
        </>
      )}
    </YStack>
  )
}
