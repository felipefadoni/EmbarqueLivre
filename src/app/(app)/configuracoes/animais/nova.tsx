import { useLocalSearchParams } from 'expo-router'

import { AnimalEditor } from '@/features/cadastros/AnimalEditor'
import { firstParam } from '@/sync/params'

export default function NovoAnimalScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  return <AnimalEditor pendenciaId={firstParam(pendencia)} />
}
