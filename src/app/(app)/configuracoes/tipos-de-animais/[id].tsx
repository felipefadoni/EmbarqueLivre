import { useLocalSearchParams } from 'expo-router'

import { AnimalTypeEditor } from '@/features/cadastros/AnimalTypeEditor'
import { firstParam } from '@/sync/params'

export default function EditarTipoScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  return <AnimalTypeEditor typeId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
