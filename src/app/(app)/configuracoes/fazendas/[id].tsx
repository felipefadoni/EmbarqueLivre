import { useLocalSearchParams } from 'expo-router'

import { FarmEditor } from '@/features/cadastros/FarmEditor'

export default function EditarFazendaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <FarmEditor farmId={typeof id === 'string' ? id : id?.[0]} />
}
