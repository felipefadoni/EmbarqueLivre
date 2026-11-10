/** Textos do cabeçalho do Dashboard (saudação, nome, iniciais). Puro. */
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

/** "X de Y animais liberados" (singular/plural). */
export function textoLiberados(liberados: number, total: number): string {
  return `${liberados} de ${total} ${total === 1 ? 'animal liberado' : 'animais liberados'}`
}

/**
 * Linhas de apoio do cartão "Aptos para embarque hoje". Sem histórico NÃO conta como apto.
 * `allFreeAt` = maior fim de carência entre os animais em carência (todos liberados nessa data, exceto os sem histórico).
 */
export function aptosHints(
  s: { emCarencia: number; semHistorico: number; allFreeAt: string | null },
  farmFiltered: boolean,
): string[] {
  const hints: string[] = []
  if (s.emCarencia > 0 && s.allFreeAt) {
    const [y, m, d] = s.allFreeAt.split('-')
    hints.push(`${s.emCarencia} em carência · ${farmFiltered ? 'fazenda' : 'todos'} sem carência em ${d}/${m}/${y}`)
  } else if (s.emCarencia === 0) {
    hints.push('Nenhum animal em carência')
  }
  if (s.semHistorico > 0) hints.push(`${s.semHistorico} sem vacina registrada (não aptos)`)
  return hints
}
