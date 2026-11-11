import { Redirect, useLocalSearchParams } from 'expo-router'

import { AnimalTypeEditor } from '@/features/cadastros/AnimalTypeEditor'
import { canManageAnimalTypes } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { firstParam } from '@/sync/params'

export default function NovoTipoScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  const { user } = useAuth()
  if (!canManageAnimalTypes(user?.role)) return <Redirect href="/configuracoes/tipos-de-animais" />
  return <AnimalTypeEditor pendenciaId={firstParam(pendencia)} />
}
