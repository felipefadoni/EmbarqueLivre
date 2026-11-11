import { Redirect, useLocalSearchParams } from 'expo-router'

import { AnimalTypeEditor } from '@/features/cadastros/AnimalTypeEditor'
import { canManageAnimalTypes } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { firstParam } from '@/sync/params'

/** Só o admin edita. Master (leitura na lista) e basic são redirecionados se abrirem esta rota direto. */
export default function EditarTipoScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  const { user } = useAuth()
  if (!canManageAnimalTypes(user?.role)) return <Redirect href="/configuracoes/tipos-de-animais" />
  return <AnimalTypeEditor typeId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
