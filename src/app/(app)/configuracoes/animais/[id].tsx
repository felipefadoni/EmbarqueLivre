import { useLocalSearchParams } from 'expo-router'

import { AnimalEditor } from '@/features/cadastros/AnimalEditor'

export default function EditarAnimalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <AnimalEditor animalId={typeof id === 'string' ? id : id?.[0]} />
}
