import { useLocalSearchParams } from 'expo-router'

import { HerdEditor } from '@/features/cadastros/HerdEditor'
import { firstParam } from '@/sync/params'

export default function EditarRebanhoScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  return <HerdEditor herdId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
