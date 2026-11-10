import { Redirect } from 'expo-router'

import { VaccineEditor } from '@/features/cadastros/VaccineEditor'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'

export default function NovaVacinaScreen() {
  const { user } = useAuth()
  if (!canManageCatalog(user?.role)) {
    return <Redirect href="/configuracoes/vacinas" />
  }
  return <VaccineEditor />
}
