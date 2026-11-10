import { useLocalSearchParams } from 'expo-router'

import { VaccinationEditor } from '@/features/vacinacoes/VaccinationEditor'

export default function EditarLancamentoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <VaccinationEditor vaccinationId={typeof id === 'string' ? id : id?.[0]} />
}
