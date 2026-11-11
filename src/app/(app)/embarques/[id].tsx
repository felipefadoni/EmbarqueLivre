import { Redirect, useLocalSearchParams } from 'expo-router'

import { useAuth } from '@/features/auth/AuthProvider'
import { canDeleteShipments, canFinishShipments, canManageShipments } from '@/features/cadastros/permissions'
import { ShipmentDetail } from '@/features/embarques/ShipmentDetail'
import { firstParam } from '@/sync/params'

/**
 * Detalhe do embarque. Finalizar: basic, master, admin. Excluir: só master/admin (canDeleteShipments).
 * Exportar Dados (PDF, só finalizado): só master/admin — o papel vai para o detalhe, que esconde e recusa.
 */
export default function EmbarqueScreen() {
  const { id, pendencia, adicionar } = useLocalSearchParams<{ id: string; pendencia?: string; adicionar?: string }>()
  const { user } = useAuth()
  if (!canManageShipments(user?.role)) return <Redirect href="/" />
  const shipmentId = firstParam(id)
  if (!shipmentId) return <Redirect href="/embarques" />
  return (
    <ShipmentDetail
      key={shipmentId}
      shipmentId={shipmentId}
      pendenciaId={firstParam(pendencia)}
      openAdd={firstParam(adicionar) === '1'}
      canDelete={canDeleteShipments(user?.role)}
      canFinish={canFinishShipments(user?.role)}
      role={user?.role ?? null}
    />
  )
}
