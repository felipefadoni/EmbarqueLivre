import { Stack } from 'expo-router'
import { useColorScheme } from 'react-native'

/**
 * Âncora da stack do Menu: telas abertas de outra aba (Dashboard, indicador de sync) com
 * `withAnchor` (pushWithAnchor) ficam com o index embaixo, então o voltar (header ou botão
 * físico do Android) leva ao index do Menu. Deep links também ganham o index embaixo.
 */
export const unstable_settings = {
  anchor: 'index',
}

export default function ConfiguracoesLayout() {
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
        headerTitleStyle: { fontWeight: '800', fontSize: 18, color },
        headerBackTitle: 'Voltar',
        contentStyle: { backgroundColor },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Configurações' }} />
      <Stack.Screen name="fazendas/index" options={{ title: 'Fazendas' }} />
      <Stack.Screen name="fazendas/nova" options={{ title: 'Nova fazenda' }} />
      <Stack.Screen name="fazendas/[id]" options={{ title: 'Editar fazenda' }} />
      <Stack.Screen name="vacinas/index" options={{ title: 'Vacinas' }} />
      <Stack.Screen name="vacinas/nova" options={{ title: 'Nova vacina' }} />
      <Stack.Screen name="vacinas/[id]" options={{ title: 'Editar vacina' }} />
      <Stack.Screen name="tipos-de-animais/index" options={{ title: 'Tipos de animais' }} />
      <Stack.Screen name="tipos-de-animais/nova" options={{ title: 'Novo tipo' }} />
      <Stack.Screen name="tipos-de-animais/[id]" options={{ title: 'Editar tipo' }} />
      <Stack.Screen name="animais/index" options={{ title: 'Animais' }} />
      <Stack.Screen name="animais/nova" options={{ title: 'Novo animal' }} />
      <Stack.Screen name="animais/[id]" options={{ title: 'Editar animal' }} />
      <Stack.Screen name="rebanhos/index" options={{ title: 'Rebanho' }} />
      <Stack.Screen name="rebanhos/nova" options={{ title: 'Novo rebanho' }} />
      <Stack.Screen name="rebanhos/[id]" options={{ title: 'Editar rebanho' }} />
      <Stack.Screen name="usuarios/index" options={{ title: 'Usuários' }} />
      <Stack.Screen name="usuarios/nova" options={{ title: 'Novo usuário' }} />
      <Stack.Screen name="usuarios/[id]" options={{ title: 'Usuário' }} />
      <Stack.Screen name="pendencias" options={{ title: 'Pendências' }} />
      <Stack.Screen name="conflitos" options={{ title: 'Salvos só no aparelho' }} />
      <Stack.Screen name="excluir-conta" options={{ title: 'Excluir minha conta' }} />
    </Stack>
  )
}
