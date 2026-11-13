/**
 * Autor (quem cadastrou) nas listas do ADMIN: nome e e-mail, por tabela e por coluna.
 *
 * Contrato final confirmado no código da API (12/11/2026 21:47, uncommitted lá): `docker/powersync/sync-config.yaml`
 * (stream `admin_all`), migration `20261112210000_add_record_authors` (colunas + triggers que reescrevem as linhas
 * quando o autor muda nome/e-mail), `src/modules/sync/application/upload/sync-columns.ts` (created_by_* readOnly).
 * - farms, herds e animals: `created_by_name` e `created_by_email` (texto, null em linhas anteriores a 12/11).
 * - Só o admin recebe (admin_all); no stream `account` (master/básico) as colunas ficam null localmente.
 * - O id do autor não é sincronizado.
 * - A API ignora created_by_* no upload; o app também nunca envia (NEVER_UPLOAD_COLUMNS em mapping.ts).
 * Uma coluna com `null` aqui = não mostrar / não filtrar (para desligar sem mexer nas telas).
 */
export type AuthorTable = 'farms' | 'animals' | 'herds'
export type AuthorColumns = { email: string | null; name: string | null }

export const AUTHOR_CONTRACT: Record<AuthorTable, AuthorColumns> = {
  farms: { email: 'created_by_email', name: 'created_by_name' },
  animals: { email: 'created_by_email', name: 'created_by_name' },
  herds: { email: 'created_by_email', name: 'created_by_name' },
}

/** Usuários (REST): só o admin recebe `createdBy: { id, name, email } | null` em GET /account/users (master/básico: sem a chave). */
export const USER_CREATED_BY_FIELD = 'createdBy'

export function hasAuthorEmail(table: AuthorTable, contract: Record<AuthorTable, AuthorColumns> = AUTHOR_CONTRACT): boolean {
  return Boolean(contract[table].email)
}

export function hasAuthorName(table: AuthorTable, contract: Record<AuthorTable, AuthorColumns> = AUTHOR_CONTRACT): boolean {
  return Boolean(contract[table].name)
}

export function hasAuthor(table: AuthorTable, contract: Record<AuthorTable, AuthorColumns> = AUTHOR_CONTRACT): boolean {
  return hasAuthorEmail(table, contract) || hasAuthorName(table, contract)
}

/** Texto neutro para linhas sem autor (anteriores ao contrato). */
export const AUTHOR_UNKNOWN_LABEL = 'Autor não registrado'
