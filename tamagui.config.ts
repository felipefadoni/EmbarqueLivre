import { defaultConfig } from '@tamagui/config/v6'
import { createTamagui } from 'tamagui'

/**
 * Tema do curral: uso sob sol forte, com luva e uma mão só.
 * Cores de status com contraste AAA (>= 7:1) entre fundo e texto.
 */
const statusClaro = {
  liberado: '#075E26',
  'liberado-color': '#FFFFFF',
  bloqueado: '#A10E0E',
  'bloqueado-color': '#FFFFFF',
  'sem-historico': '#FFC400',
  'sem-historico-color': '#000000',
}

const statusEscuro: typeof statusClaro = {
  liberado: '#0A7A31',
  'liberado-color': '#FFFFFF',
  bloqueado: '#B3110F',
  'bloqueado-color': '#FFFFFF',
  'sem-historico': '#FFC400',
  'sem-historico-color': '#000000',
}

type BaseThemes = typeof defaultConfig.themes
type CurralThemes = { [K in keyof BaseThemes]: BaseThemes[K] & typeof statusClaro }

const themes = Object.fromEntries(
  Object.entries(defaultConfig.themes).map(([nome, tema]) => [
    nome,
    { ...tema, ...(nome.startsWith('dark') ? statusEscuro : statusClaro) },
  ]),
) as CurralThemes

/** Alvo de toque mínimo para uso com luva: $14 = 56 px. Ações principais: $16 = 64 px. */
export const TOQUE_MINIMO = '$14' as const
export const TOQUE_PRINCIPAL = '$16' as const

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  themes,
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
