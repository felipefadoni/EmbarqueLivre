import { useLocalSearchParams } from 'expo-router'

import { AnimalEditor } from '@/features/cadastros/AnimalEditor'
import { firstParam } from '@/sync/params'

export default function EditarAnimalScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  return <AnimalEditor animalId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
