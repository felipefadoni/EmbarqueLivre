import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Config dinâmica: o app.json continua sendo a fonte; aqui só entra o que depende da variante.
 *
 * APP_VARIANT=production (definido no perfil "production" do eas.json e, se quiser espelhar a loja localmente, na
 * linha de comando) tira o expo-dev-client do build nativo (plugins/withoutDevClient.js). Sem a variável (dev,
 * `pnpm expo start`, `pnpm expo run:*`), nada muda e o dev-client continua.
 * Doc: https://docs.expo.dev/build-reference/variants/
 */
export const IS_PRODUCTION_VARIANT = process.env.APP_VARIANT === 'production'

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig
  if (!IS_PRODUCTION_VARIANT) return base
  return { ...base, plugins: [...(base.plugins ?? []), './plugins/withoutDevClient'] }
}
