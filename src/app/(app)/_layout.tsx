import { Tabs } from 'expo-router'

import { AppTabBar } from '@/components/navigation/AppTabBar'
import { usePhotoUploadQueue } from '@/sync/usePhotoUploadQueue'
import { useSyncTriggers } from '@/sync/useSyncTriggers'

export default function AppLayout() {
  // Fila de fotos do embarque: o envio é feito pelo upload do PowerSync (foto → vínculo → finalizar); aqui só a limpeza de arquivos órfãos.
  usePhotoUploadQueue()
  // Sync automático: rede voltou (Wi‑Fi ou celular) / app em primeiro plano → reconecta; agenda o envio em segundo plano.
  useSyncTriggers()
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="lancamentos" options={{ title: 'Vacinas' }} />
      <Tabs.Screen name="embarques" options={{ title: 'Embarques' }} />
      <Tabs.Screen name="configuracoes" options={{ title: 'Menu' }} />
    </Tabs>
  )
}
