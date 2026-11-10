// TODO: dados de exemplo até o PowerSync
export const DASHBOARD_PLACEHOLDER = {
  proximoEmbarque: {
    fazenda: 'Fazenda São João',
    dataIso: '2026-11-12',
    cabecas: 24,
    liberados: 22,
    total: 24,
    score: 92,
    diasParaEmbarque: 2,
  },
  resumo: {
    liberados: 18,
    emCarencia: 5,
    semHistorico: 2,
  },
  embarquesPorPeriodo: {
    dia: [2, 3, 1, 4, 2, 3, 5],
    semana: [4, 6, 3, 8, 5, 2, 7],
    mes: [12, 18, 9, 22, 15, 11, 19],
  },
} as const

export type PeriodoGrafico = keyof typeof DASHBOARD_PLACEHOLDER.embarquesPorPeriodo

export function saudacaoAgora(date = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hora = date.getHours()
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function primeiroNome(name: string | undefined | null): string {
  const parte = name?.trim().split(/\s+/)[0]
  return parte || 'produtor'
}

export function iniciaisDoNome(name: string | undefined | null): string {
  const partes = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'EL'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
}

export function formatarDataCurta(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  const data = new Date(ano, (mes ?? 1) - 1, dia ?? 1)
  return data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}
