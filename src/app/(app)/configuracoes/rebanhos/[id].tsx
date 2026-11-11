import { Redirect, useLocalSearchParams } from 'expo-router'

import { HerdEditor } from '@/features/cadastros/HerdEditor'
import { canManageHerds } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { firstParam } from '@/sync/params'

export default function EditarRebanhoScreen() {
  const { id, pendencia } = useLocalSearchParams<{ id: string; pendencia?: string }>()
  const { user } = useAuth()
  if (!canManageHerds(user?.role)) return <Redirect href="/configuracoes" />
  return <HerdEditor herdId={firstParam(id)} pendenciaId={firstParam(pendencia)} />
}
