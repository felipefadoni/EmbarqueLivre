import { defaultConfig } from '@tamagui/config/v6'
import { createTamagui } from 'tamagui'

/**
 * Paleta de marca do Embarque Livre.
 * #99C2AB sage, #CEE3CD verde-claro, #2B3D34 verde-escuro, #D1EFEF aqua.
 * Fundo claro das telas de auth: branco da tela (#FFFFFF). Campos usam aqua + borda sage.
 */
const brandFixo = {
  brandSage: '#99C2AB',
  brandSageLight: '#CEE3CD',
  brandInk: '#2B3D34',
  brandAqua: '#D1EFEF',
  brandBorder: '#99C2AB',
} as const

const brandClaro = {
  ...brandFixo,
  brandBg: '#FFFFFF',
  brandFg: '#2B3D34',
  brandSurface: '#D1EFEF',
  brandPrimary: '#2B3D34',
  brandPrimaryFg: '#D1EFEF',
  brandMuted: '#3A5247',
  brandError: '#8B1515',
  brandSuccess: '#075E26',
  appBg: '#EEF6EF',
  cardBg: '#FFFFFF',
  tabBarBg: '#FFFFFF',
  tabInactive: '#7A8B80',
} as const

const brandEscuro = {
  ...brandFixo,
  brandBg: '#2B3D34',
  brandFg: '#D1EFEF',
  brandSurface: '#3A5247',
  brandPrimary: '#99C2AB',
  brandPrimaryFg: '#2B3D34',
  brandMuted: '#CEE3CD',
  brandError: '#FF8A80',
  brandSuccess: '#8BE19A',
  appBg: '#152821',
  cardBg: '#243B32',
  tabBarBg: '#1C3C31',
  tabInactive: '#A8B8AF',
}

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

type BrandTokens = { [K in keyof typeof brandClaro]: string }
type BaseThemes = typeof defaultConfig.themes
type CurralThemes = {
  [K in keyof BaseThemes]: BaseThemes[K] & typeof statusClaro & BrandTokens
}

const themes = Object.fromEntries(
  Object.entries(defaultConfig.themes).map(([nome, tema]) => [
    nome,
    {
      ...tema,
      ...(nome.startsWith('dark')
        ? { ...statusEscuro, ...brandEscuro }
        : { ...statusClaro, ...brandClaro }),
    },
  ]),
) as CurralThemes

/** Alvo de toque mínimo para uso com luva: $14 = 56 px. Ações principais: $16 = 64 px. */
export const TOQUE_MINIMO = '14' as const
export const TOQUE_PRINCIPAL = '16' as const

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  themes,
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
