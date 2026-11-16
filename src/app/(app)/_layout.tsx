import { Tabs } from 'expo-router'

import { LegalReacceptanceGate } from '@/components/auth/LegalReacceptanceGate'
import { AppTabBar } from '@/components/navigation/AppTabBar'
import { useLegalReacceptance } from '@/features/auth/useLegalReacceptance'
import { usePhotoUploadQueue } from '@/sync/usePhotoUploadQueue'
import { useSyncTriggers } from '@/sync/useSyncTriggers'

export default function AppLayout() {
  // Fila de fotos do embarque: o envio é feito pelo upload do PowerSync (foto → vínculo → finalizar); aqui a limpeza de
  // arquivos órfãos e o download (uso offline) das fotos dos embarques em andamento que só estão no servidor.
  usePhotoUploadQueue()
  // Sync automático: rede voltou (Wi‑Fi ou celular) / app em primeiro plano → reconecta; agenda o envio em segundo plano.
  useSyncTriggers()
  // Re-aceite de Termos/Política (versão nova): tela bloqueante POR CIMA das abas, que seguem montadas (sync e fila
  // continuam). Só com internet; offline o trabalho de campo segue (ver features/auth/legalReacceptance.ts).
  const legal = useLegalReacceptance()
  return (
    <>
      <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="lancamentos" options={{ title: 'Vacinas' }} />
        <Tabs.Screen name="embarques" options={{ title: 'Embarques' }} />
        <Tabs.Screen name="configuracoes" options={{ title: 'Menu' }} />
      </Tabs>
      {legal.gateVisible && legal.status ? (
        <LegalReacceptanceGate status={legal.status} onAccepted={legal.applyStatus} onReload={legal.reload} />
      ) : null}
    </>
  )
}
