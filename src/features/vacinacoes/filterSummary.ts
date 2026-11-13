/**
 * Resumo dos filtros da tela Vacinas (painel fechado). Puro, testável no Node.
 * A data sempre aparece; fazenda e código só quando aplicados. O contador conta só o que
 * difere do padrão (data ≠ hoje, fazenda escolhida, código buscado).
 */
import { formatDatePtBr } from '@/features/cadastros/dates'
import { textFilterLabel } from '@/features/cadastros/textFilter'

export type VaccinationFilters = {
  date: string
  today: string
  farmName?: string | null
  code?: string | null
  /** Só admin: e-mail de quem cadastrou. */
  authorEmail?: string | null
}

export function summarizeVaccinationFilters({ date, today, farmName, code, authorEmail }: VaccinationFilters) {
  const farm = farmName?.trim() || ''
  const search = code?.trim() || ''
  const email = textFilterLabel('E-mail', authorEmail)
  const parts = [formatDatePtBr(date) || date, farm, search ? `"${search}"` : '', email].filter(Boolean)
  const activeCount = (date !== today ? 1 : 0) + (farm ? 1 : 0) + (search ? 1 : 0) + (email ? 1 : 0)
  return { text: parts.join(' · '), activeCount }
}
