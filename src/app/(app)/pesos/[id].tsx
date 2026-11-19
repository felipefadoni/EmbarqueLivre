import { useLocalSearchParams } from 'expo-router'

import { WeighingEditor } from '@/features/pesos/WeighingEditor'
import { firstParam } from '@/sync/params'

export default function CorrigirPesoScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  return <WeighingEditor weighingId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
