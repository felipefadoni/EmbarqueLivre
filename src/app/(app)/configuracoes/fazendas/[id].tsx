import { useLocalSearchParams } from 'expo-router'

import { FarmEditor } from '@/features/cadastros/FarmEditor'
import { firstParam } from '@/sync/params'

export default function EditarFazendaScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  return <FarmEditor farmId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
