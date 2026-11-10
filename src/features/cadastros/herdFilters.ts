/**
 * Resumo dos filtros da lista de rebanhos (painel fechado). Puro, testável no Node.
 * Fazenda e busca só entram quando aplicados.
 */
export function summarizeHerdFilters({ farmName, search }: { farmName?: string | null; search?: string | null }) {
  const farm = farmName?.trim() || ''
  const query = search?.trim() || ''
  const parts = [farm, query ? `"${query}"` : ''].filter(Boolean)
  const activeCount = (farm ? 1 : 0) + (query ? 1 : 0)
  return { text: parts.join(' · ') || 'Todos os rebanhos', activeCount }
}
