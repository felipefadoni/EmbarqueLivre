import { Redirect, useLocalSearchParams } from 'expo-router'

import { VaccineEditor } from '@/features/cadastros/VaccineEditor'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { firstParam } from '@/sync/params'

export default function NovaVacinaScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  const { user } = useAuth()
  if (!canManageCatalog(user?.role)) {
    return <Redirect href="/configuracoes/vacinas" />
  }
  return <VaccineEditor pendenciaId={firstParam(pendencia)} />
}
