import { useLocalSearchParams } from 'expo-router'

import { VaccineEditor } from '@/features/cadastros/VaccineEditor'

export default function EditarVacinaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <VaccineEditor vaccineId={typeof id === 'string' ? id : id?.[0]} />
}
