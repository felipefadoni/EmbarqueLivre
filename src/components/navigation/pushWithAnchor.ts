import { router, type Href } from 'expo-router'

/**
 * Abre uma tela de OUTRA aba (ex.: Dashboard → /configuracoes/animais) incluindo a âncora da stack de destino
 * (`unstable_settings.anchor` no _layout dela). Assim, se a stack ainda não existia, ela nasce como
 * [index, tela] e o voltar do header / botão físico do Android leva ao index (ex.: Menu), e não sai da aba.
 * Se a stack já existe, é um push normal sobre o histórico dela.
 */
export function pushWithAnchor(href: Href) {
  router.push(href, { withAnchor: true })
}
