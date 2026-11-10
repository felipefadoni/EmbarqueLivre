import { useLocalSearchParams } from 'expo-router'

import { VaccineEditor } from '@/features/cadastros/VaccineEditor'
import { firstParam } from '@/sync/params'

export default function EditarVacinaScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  return <VaccineEditor vaccineId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
