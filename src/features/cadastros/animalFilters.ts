/**
 * Resumo dos filtros da lista de animais (painel fechado). Puro, testável no Node.
 * Situação, fazenda, tipo e rebanho só entram (e contam no badge) quando aplicados.
 * Esta lista não tem busca de texto.
 */
import type { AnimalSituation } from '@/sync/queries'

export const ANIMAL_SITUATION_SUMMARY: Record<AnimalSituation, string> = {
  liberado: 'Liberados',
  carencia: 'Em carência',
  libera7: 'Livres em até 7 dias',
  sem_historico: 'Sem histórico',
}

export type AnimalFilterSummaryInput = {
  situacao?: AnimalSituation | '' | null
  farmName?: string | null
  typeName?: string | null
  herdName?: string | null
}

export function summarizeAnimalFilters({ situacao, farmName, typeName, herdName }: AnimalFilterSummaryInput) {
  const situation = situacao ? ANIMAL_SITUATION_SUMMARY[situacao] : ''
  const farm = farmName?.trim() || ''
  const type = typeName?.trim() || ''
  const herd = herdName?.trim() || ''
  const parts = [situation, farm, type, herd].filter(Boolean)
  return { text: parts.join(' · ') || 'Todos os animais', activeCount: parts.length }
}
