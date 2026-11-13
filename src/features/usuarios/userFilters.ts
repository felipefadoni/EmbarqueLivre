/**
 * Filtros por nome e por e-mail da lista de Usuários do ADMIN (REST, online, keyset: mais novos primeiro). Puro.
 *
 * A API aceita `name` e `email` (contém, sem diferenciar maiúsculas), mas compara com `lower(...) LIKE`, que
 * DIFERENCIA acentos: `name=joao` não acha "João". Então:
 * - e-mail → vai no servidor (`email`; e-mail não tem acento), reduz as páginas;
 * - nome → filtrado no aparelho, sem acentos ("joao" acha "João"), sobre as páginas já carregadas; com poucos
 *   resultados, a tela carrega mais páginas sozinha, até USER_AUTO_LOAD_MAX_PAGES por filtro;
 * - os dois → `email` no servidor e o nome refina no aparelho.
 * Master continua com a busca única de antes (search + page/limit, sem mudança).
 */
import { foldText, matchesText, textFilterLabel } from '@/features/cadastros/textFilter'

export type UserTextFilters = { name?: string; email?: string }

/** Filtros enviados ao servidor (modo cursor): só o e-mail. O nome nunca vai (acentos), ver acima. */
export function userServerFilters({ email }: UserTextFilters): { email?: string } {
  const value = String(email ?? '').trim()
  return value ? { email: value } : {}
}

/** @deprecated modo antigo; use userServerFilters. */
export function userServerSearch({ email }: UserTextFilters): string | undefined {
  return userServerFilters({ email }).email
}

export function filterUsers<T extends { name: string; email: string }>(items: readonly T[], { name, email }: UserTextFilters): T[] {
  if (!foldText(name) && !foldText(email)) return items as T[]
  return items.filter((user) => matchesText(user.name, name) && matchesText(user.email, email))
}

/** Filtro local ativo, poucos resultados visíveis e o servidor tem mais páginas: carregar mais sozinho. */
export const USER_FILTER_MIN_VISIBLE = 15
/** Limite de páginas carregadas sozinhas por filtro (50 por página → até 500 usuários varridos); depois, só rolando. */
export const USER_AUTO_LOAD_MAX_PAGES = 10

export function shouldAutoLoadMore(input: {
  filters: UserTextFilters
  visible: number
  hasMore: boolean
  busy: boolean
  /** Páginas já carregadas sozinhas desde a última troca de filtro. */
  autoLoaded?: number
  minVisible?: number
  maxPages?: number
}): boolean {
  const localActive = Boolean(foldText(input.filters.name))
  if (!localActive || !input.hasMore || input.busy) return false
  if ((input.autoLoaded ?? 0) >= (input.maxPages ?? USER_AUTO_LOAD_MAX_PAGES)) return false
  return input.visible < (input.minVisible ?? USER_FILTER_MIN_VISIBLE)
}

export function summarizeUserFilters({ name, email }: UserTextFilters, accountName?: string | null) {
  const parts = [accountName?.trim() || '', textFilterLabel('Nome', name), textFilterLabel('E-mail', email)].filter(Boolean)
  return { text: parts.join(' · ') || 'Todos os usuários', activeCount: parts.length }
}
