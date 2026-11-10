import { useLocalSearchParams } from 'expo-router'

import { HerdEditor } from '@/features/cadastros/HerdEditor'
import { firstParam } from '@/sync/params'

export default function NovoRebanhoScreen() {
  const { pendencia } = useLocalSearchParams<{ pendencia?: string }>()
  return <HerdEditor pendenciaId={firstParam(pendencia)} />
}
