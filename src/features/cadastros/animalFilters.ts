/**
 * Resumo dos filtros da lista de animais (painel fechado). Puro, testável no Node.
 * Situação, fazenda, tipo e rebanho só entram (e contam no badge) quando aplicados.
 * Só o admin tem filtro de texto (nome da fazenda; e-mail do autor quando o contrato existir).
 */
import type { AnimalSituation } from '@/sync/queries'

import { textFilterLabel } from './textFilter'

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
  /** Só admin: texto do nome da fazenda. */
  farmSearch?: string | null
  /** Só admin, e só com o contrato do autor disponível. */
  authorEmail?: string | null
}

export function summarizeAnimalFilters({ situacao, farmName, typeName, herdName, farmSearch, authorEmail }: AnimalFilterSummaryInput) {
  const situation = situacao ? ANIMAL_SITUATION_SUMMARY[situacao] : ''
  const farm = farmName?.trim() || ''
  const type = typeName?.trim() || ''
  const herd = herdName?.trim() || ''
  const parts = [situation, farm, type, herd, textFilterLabel('Fazenda', farmSearch), textFilterLabel('E-mail', authorEmail)].filter(Boolean)
  return { text: parts.join(' · ') || 'Todos os animais', activeCount: parts.length }
}
