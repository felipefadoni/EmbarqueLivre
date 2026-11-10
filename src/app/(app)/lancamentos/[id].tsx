import { useLocalSearchParams } from 'expo-router'

import { VaccinationEditor } from '@/features/vacinacoes/VaccinationEditor'
import { firstParam } from '@/sync/params'

export default function EditarLancamentoScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  return <VaccinationEditor vaccinationId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
