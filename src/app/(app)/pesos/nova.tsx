import { useLocalSearchParams } from 'expo-router'

import { WeighingEditor } from '@/features/pesos/WeighingEditor'
import { firstParam } from '@/sync/params'

export default function LancarPesoScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  return <WeighingEditor pendenciaId={firstParam(pendencia)} />
}
