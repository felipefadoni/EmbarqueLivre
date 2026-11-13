/**
 * Resumo dos filtros da lista de rebanhos (painel fechado). Puro, testável no Node.
 * Fazenda e busca só entram quando aplicados.
 */
export function summarizeHerdFilters({
  farmName,
  search,
  authorEmail,
}: {
  farmName?: string | null
  search?: string | null
  /** Só admin: e-mail de quem cadastrou. */
  authorEmail?: string | null
}) {
  const farm = farmName?.trim() || ''
  const query = search?.trim() || ''
  const author = authorEmail?.trim() || ''
  const parts = [farm, query ? `"${query}"` : '', author ? `E-mail: ${author}` : ''].filter(Boolean)
  const activeCount = (farm ? 1 : 0) + (query ? 1 : 0) + (author ? 1 : 0)
  return { text: parts.join(' · ') || 'Todos os rebanhos', activeCount }
}
