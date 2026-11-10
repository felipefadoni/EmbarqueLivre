import { useLocalSearchParams } from 'expo-router'

import { AnimalTypeEditor } from '@/features/cadastros/AnimalTypeEditor'

export default function EditarTipoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <AnimalTypeEditor typeId={typeof id === 'string' ? id : id?.[0]} />
}
