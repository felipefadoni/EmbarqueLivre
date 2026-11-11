import { Redirect, useLocalSearchParams } from 'expo-router'

import { useAuth } from '@/features/auth/AuthProvider'
import { canManageShipments } from '@/features/cadastros/permissions'
import { ShipmentForm } from '@/features/embarques/ShipmentForm'
import { firstParam } from '@/sync/params'

export default function NovoEmbarqueScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  const { user } = useAuth()
  if (!canManageShipments(user?.role)) return <Redirect href="/" />
  return <ShipmentForm pendenciaId={firstParam(pendencia)} />
}
