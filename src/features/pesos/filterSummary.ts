/**
 * Resumo dos filtros da tela Peso (painel fechado). Puro, testável no Node.
 * Sem filtro: "Todas as pesagens". O contador conta só o que está aplicado.
 */
import { textFilterLabel } from '@/features/cadastros/textFilter'

export type WeighingFilters = {
  farmName?: string | null
  code?: string | null
  /** Só admin: e-mail de quem lançou. */
  authorEmail?: string | null
}

export function summarizeWeighingFilters({ farmName, code, authorEmail }: WeighingFilters) {
  const farm = farmName?.trim() || ''
  const search = code?.trim() || ''
  const email = textFilterLabel('E-mail', authorEmail)
  const parts = [farm, search ? `"${search}"` : '', email].filter(Boolean)
  return { text: parts.join(' · ') || 'Todas as pesagens', activeCount: parts.length }
}
