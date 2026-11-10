import { Redirect } from 'expo-router'

import { AnimalTypeEditor } from '@/features/cadastros/AnimalTypeEditor'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'

export default function NovoTipoScreen() {
  const { user } = useAuth()
  if (!canManageCatalog(user?.role)) {
    return <Redirect href="/configuracoes/tipos-de-animais" />
  }
  return <AnimalTypeEditor />
}
