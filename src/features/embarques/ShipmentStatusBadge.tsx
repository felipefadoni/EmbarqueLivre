import { Text, XStack } from 'tamagui'

import { SHIPMENT_STATUS_LABEL, type ShipmentStatus } from '@/api/shipmentsContract'

/** Selo do status do embarque (Em andamento / Finalizado). */
export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const finished = status === 'finished'
  const label = SHIPMENT_STATUS_LABEL[status]
  return (
    <XStack px={12} py={6} rounded={999} bg={finished ? 'brandSage' : 'liberado'} items="center" self="flex-start" accessibilityLabel={`Status: ${label}`}>
      <Text fontSize={14} fontWeight="800" color={finished ? 'brandInk' : 'liberado-color'}>
        {label}
      </Text>
    </XStack>
  )
}
