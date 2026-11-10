import { Redirect, useLocalSearchParams } from 'expo-router'

import { FarmEditor } from '@/features/cadastros/FarmEditor'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { firstParam } from '@/sync/params'

export default function NovaFazendaScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  const { user } = useAuth()
  if (!canManageCatalog(user?.role)) {
    return <Redirect href="/configuracoes/fazendas" />
  }
  return <FarmEditor pendenciaId={firstParam(pendencia)} />
}
