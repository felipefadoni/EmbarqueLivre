import { Tabs } from 'expo-router'

import { AppTabBar } from '@/components/navigation/AppTabBar'

export default function AppLayout() {
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="lancamentos" options={{ title: 'Vacinas' }} />
      <Tabs.Screen name="configuracoes" options={{ title: 'Menu' }} />
    </Tabs>
  )
}
