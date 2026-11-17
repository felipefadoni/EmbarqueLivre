import { Redirect, useLocalSearchParams } from 'expo-router'

import { VaccineEditor } from '@/features/cadastros/VaccineEditor'
import { vaccineAccess } from '@/features/cadastros/vaccineAccess'
import { useAuth } from '@/features/auth/AuthProvider'
import { firstParam } from '@/sync/params'

export default function NovaVacinaScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  const { user } = useAuth()
  if (!vaccineAccess(user?.role).canCreate) return <Redirect href="/configuracoes" />
  return <VaccineEditor pendenciaId={firstParam(pendencia)} />
}
