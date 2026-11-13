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

/** Autor como vem das consultas locais (created_by_name/email) ou do REST (`createdBy`); string = só o e-mail. */
export type AuthorValue = { name?: string | null; email?: string | null }

/**
 * Linhas do autor para o admin (componente AuthorLines):
 * - "Criado por: Nome" e "Email: email", só as que existirem;
 * - nenhum dos dois (registro antigo / sem autor) → ["Autor não registrado"].
 */
export function authorLines(author: AuthorValue | string | null | undefined): string[] {
  const value: AuthorValue = typeof author === 'string' ? { email: author } : (author ?? {})
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const email = typeof value.email === 'string' ? value.email.trim() : ''
  const lines = [name ? `Criado por: ${name}` : '', email ? `Email: ${email}` : ''].filter(Boolean)
  return lines.length ? lines : [AUTHOR_UNKNOWN_LABEL]
}

export function summarizeFarmFilters({ farmName, authorEmail }: FarmTextFilters, contract: Contract = AUTHOR_CONTRACT) {
  const parts = [textFilterLabel('Nome', farmName), hasAuthorEmail('farms', contract) ? textFilterLabel('E-mail', authorEmail) : ''].filter(Boolean)
  return { text: parts.join(' · ') || 'Todas as fazendas', activeCount: parts.length }
}

/** Filtro do catálogo de Vacinas (só admin): por enquanto só o e-mail de quem cadastrou. */
export function summarizeVaccineFilters({ authorEmail }: { authorEmail: string }, contract: Contract = AUTHOR_CONTRACT) {
  const parts = [hasAuthorEmail('vaccines', contract) ? textFilterLabel('E-mail', authorEmail) : ''].filter(Boolean)
  return { text: parts.join(' · ') || 'Todas as vacinas', activeCount: parts.length }
}
