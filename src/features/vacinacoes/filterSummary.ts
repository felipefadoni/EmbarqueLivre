/**
 * Resumo dos filtros da tela Vacinas (painel fechado). Puro, testável no Node.
 * A data sempre aparece; fazenda e código só quando aplicados. O contador conta só o que
 * difere do padrão (data ≠ hoje, fazenda escolhida, código buscado).
 */
import { formatDatePtBr } from '@/features/cadastros/dates'

export type VaccinationFilters = {
  date: string
  today: string
  farmName?: string | null
  code?: string | null
}

export function summarizeVaccinationFilters({ date, today, farmName, code }: VaccinationFilters) {
  const farm = farmName?.trim() || ''
  const search = code?.trim() || ''
  const parts = [formatDatePtBr(date) || date, farm, search ? `"${search}"` : ''].filter(Boolean)
  const activeCount = (date !== today ? 1 : 0) + (farm ? 1 : 0) + (search ? 1 : 0)
  return { text: parts.join(' · '), activeCount }
}
