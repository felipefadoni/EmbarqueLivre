/**
 * Resumo dos filtros da lista de embarques (painel fechado). Puro, testável no Node.
 * Fazenda, período e busca só entram (e contam no selo) quando aplicados.
 */
import type { ShipmentWhen } from '@/sync/queries'

export const SHIPMENT_WHEN_LABEL: Record<ShipmentWhen, string> = {
  proximos: 'Próximos',
  realizados: 'Já realizados',
}

export function summarizeShipmentFilters({
  farmName,
  when,
  search,
}: {
  farmName?: string | null
  when?: ShipmentWhen | '' | null
  search?: string | null
}) {
  const farm = farmName?.trim() || ''
  const period = when ? SHIPMENT_WHEN_LABEL[when] : ''
  const query = search?.trim() || ''
  const parts = [period, farm, query ? `"${query}"` : ''].filter(Boolean)
  return { text: parts.join(' · ') || 'Todos os embarques', activeCount: parts.length }
}
