import { Stack } from 'expo-router'
import { useColorScheme } from 'react-native'

/** Área de Embarques (tab própria): lista com abas Em andamento / Finalizado, novo e detalhe. */
export default function EmbarquesLayout() {
  const isDark = useColorScheme() === 'dark'
  const backgroundColor = isDark ? '#152821' : '#EEF6EF'
  const color = isDark ? '#D1EFEF' : '#2B3D34'

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor },
        headerTintColor: color,
        headerTitleStyle: { fontWeight: '800', fontSize: 20, color },
        headerBackTitle: 'Voltar',
        contentStyle: { backgroundColor },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="index" options={{ title: 'Embarques' }} />
      <Stack.Screen name="nova" options={{ title: 'Novo embarque' }} />
      <Stack.Screen name="[id]" options={{ title: 'Embarque' }} />
    </Stack>
  )
}
