import { useLocalSearchParams } from 'expo-router'

import { VaccinationEditor } from '@/features/vacinacoes/VaccinationEditor'
import { firstParam } from '@/sync/params'

export default function InformarVacinaScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  return <VaccinationEditor pendenciaId={firstParam(pendencia)} />
}
