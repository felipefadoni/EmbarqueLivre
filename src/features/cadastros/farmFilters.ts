/**
 * Filtros e autor das listas do ADMIN (Fazendas, Animais, Rebanhos, Usuários, Vacinas e Embarques). Puro, testável no Node.
 * Master e básico não têm filtros de texto nem veem o autor (comportamento inalterado).
 */
import { AUTHOR_CONTRACT, AUTHOR_UNKNOWN_LABEL, hasAuthor, hasAuthorEmail, type AuthorColumns, type AuthorTable } from '@/api/authorContract'
import type { UserRole } from '@/api/types'

import { textFilterLabel } from './textFilter'

type Contract = Record<AuthorTable, AuthorColumns>

export type FarmTextFilters = { farmName?: string; authorEmail?: string }

/** Painel de filtros de texto e autor: só o admin vê (fazendas, animais, rebanhos e usuários). */
export function canUseAdminFilters(role: UserRole | null | undefined): boolean {
  return role === 'admin'
}

/** Linha do autor (nome e/ou e-mail) na lista: admin E a API já expõe alguma coluna de autor da tabela. */
export function canSeeAuthor(role: UserRole | null | undefined, table: AuthorTable, contract: Contract = AUTHOR_CONTRACT): boolean {
  return canUseAdminFilters(role) && hasAuthor(table, contract)
}

/** Filtro por e-mail do autor: admin E a tabela já tem `created_by_email` no sync. */
export function canFilterByAuthorEmail(role: UserRole | null | undefined, table: AuthorTable, contract: Contract = AUTHOR_CONTRACT): boolean {
  return canUseAdminFilters(role) && hasAuthorEmail(table, contract)
}

/** @deprecated use canFilterByAuthorEmail(role, table). */
export function canSeeAuthorEmail(role: UserRole | null | undefined, table: AuthorTable = 'farms', contract: Contract = AUTHOR_CONTRACT): boolean {
  return canFilterByAuthorEmail(role, table, contract)
}

export type AuthorKind = 'farm' | 'animal' | 'herd' | 'user' | 'vaccination' | 'shipment'

/**
 * Linha do autor: "Cadastrada por Nome · email" (o que houver). Nenhum dos dois (registro antigo, null) →
 * "Autor não registrado".
 */
export function authorLine(author: { name?: string | null; email?: string | null } | string | null | undefined, kind: AuthorKind): string {
  const value = typeof author === 'string' || author == null ? { email: author ?? null } : author
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const email = typeof value.email === 'string' ? value.email.trim() : ''
  const who = [name, email].filter(Boolean).join(' · ')
  if (!who) return AUTHOR_UNKNOWN_LABEL
  return `${kind === 'farm' || kind === 'vaccination' ? 'Cadastrada' : 'Cadastrado'} por ${who}`
}

export function summarizeFarmFilters({ farmName, authorEmail }: FarmTextFilters, contract: Contract = AUTHOR_CONTRACT) {
  const parts = [textFilterLabel('Nome', farmName), hasAuthorEmail('farms', contract) ? textFilterLabel('E-mail', authorEmail) : ''].filter(Boolean)
  return { text: parts.join(' · ') || 'Todas as fazendas', activeCount: parts.length }
}
