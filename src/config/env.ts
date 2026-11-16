/**
 * Envs públicas do build. O Metro só embute EXPO_PUBLIC_* com acesso estático (`process.env.EXPO_PUBLIC_X`), por isso
 * cada uma é lida explicitamente aqui. Em release (build do EAS) os valores vêm do ambiente "production" do EAS.
 */
export type PublicEnv = {
  EXPO_PUBLIC_API_URL?: string
  EXPO_PUBLIC_POWERSYNC_URL?: string
}

export const PUBLIC_ENV: PublicEnv = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_POWERSYNC_URL: process.env.EXPO_PUBLIC_POWERSYNC_URL,
}

/** Sem estas o app não funciona em release (em dev a API cai no fallback http://localhost:3000). */
export const REQUIRED_RELEASE_ENV = ['EXPO_PUBLIC_API_URL'] as const satisfies readonly (keyof PublicEnv)[]

export type EnvProblem = { name: keyof PublicEnv; kind: 'missing' | 'invalid' }

const isHttpUrl = (value: string) => /^https?:\/\/[^\s/]+/i.test(value)

/**
 * Lista envs ausentes/inválidas (só NOMES — nunca valores). Em dev não bloqueia nada (há fallbacks locais).
 * EXPO_PUBLIC_POWERSYNC_URL é opcional (vazia = usa o `powersyncUrl` do token), mas se vier precisa ser URL.
 */
export function checkPublicEnv(env: PublicEnv = PUBLIC_ENV, isDev: boolean = typeof __DEV__ !== 'undefined' && __DEV__): EnvProblem[] {
  if (isDev) return []
  const problems: EnvProblem[] = []
  for (const name of REQUIRED_RELEASE_ENV) {
    const value = env[name]?.trim()
    if (!value) problems.push({ name, kind: 'missing' })
    else if (!isHttpUrl(value)) problems.push({ name, kind: 'invalid' })
  }
  const powersync = env.EXPO_PUBLIC_POWERSYNC_URL?.trim()
  if (powersync && !isHttpUrl(powersync)) problems.push({ name: 'EXPO_PUBLIC_POWERSYNC_URL', kind: 'invalid' })
  return problems
}
