import { Redirect } from 'expo-router'

import { FarmEditor } from '@/features/cadastros/FarmEditor'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'

export default function NovaFazendaScreen() {
  const { user } = useAuth()
  if (!canManageCatalog(user?.role)) {
    return <Redirect href="/configuracoes/fazendas" />
  }
  return <FarmEditor />
}
