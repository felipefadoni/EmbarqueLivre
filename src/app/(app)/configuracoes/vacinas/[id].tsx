import { Redirect, useLocalSearchParams } from 'expo-router'

import { VaccineEditor } from '@/features/cadastros/VaccineEditor'
import { canManageVaccines } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { firstParam } from '@/sync/params'

export default function EditarVacinaScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  const { user } = useAuth()
  if (!canManageVaccines(user?.role)) return <Redirect href="/configuracoes" />
  return <VaccineEditor vaccineId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
