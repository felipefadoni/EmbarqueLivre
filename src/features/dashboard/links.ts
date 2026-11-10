/** Destinos dos toques do Dashboard (rotas + filtros pré-aplicados). Puro. */
import type { AnimalSituation } from '@/sync/queries'

function compact(params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => Boolean(value))) as Record<string, string>
}

export function animalsLink(filters: { situacao?: AnimalSituation; farmId?: string; animalTypeId?: string; herdId?: string }) {
  return { pathname: '/configuracoes/animais' as const, params: compact(filters) }
}

export function vaccinationsLink(filters: { date?: string; farmId?: string }) {
  return { pathname: '/lancamentos' as const, params: compact(filters) }
}
