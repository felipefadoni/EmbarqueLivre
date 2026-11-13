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
 *
 * vaccinations (lançamentos, aba Vacinas) e shipments (embarques): contrato CONFIRMADO no código da API (13/11/2026
 * 16:10, uncommitted lá): migration `20261113150000_add_vaccination_shipment_authors` (colunas + triggers),
 * `docker/powersync/sync-config.yaml` (`created_by_name` / `created_by_email` SÓ no stream `admin_all`; `account` e
 * `catalogs` sem autor) e `sync-columns.ts` (created_by_* readOnly no upload). A vacina do catálogo (tabela vaccines)
 * NÃO tem autor.
 * Backfill (`20261113160000_backfill_record_authors`): farms/herds/animals/shipments sem autor recebem o master mais
 * antigo da conta; vacinações já tinham autor obrigatório. Linhas sem master na conta continuam null.
 */
export type AuthorTable = 'farms' | 'animals' | 'herds' | 'vaccinations' | 'shipments'
export type AuthorColumns = { email: string | null; name: string | null }

export const AUTHOR_CONTRACT: Record<AuthorTable, AuthorColumns> = {
  farms: { email: 'created_by_email', name: 'created_by_name' },
  animals: { email: 'created_by_email', name: 'created_by_name' },
  herds: { email: 'created_by_email', name: 'created_by_name' },
  vaccinations: { email: 'created_by_email', name: 'created_by_name' },
  shipments: { email: 'created_by_email', name: 'created_by_name' },
}

/**
 * REST de /vaccinations e /shipments (lista e detalhe), confirmado na API: só o ADMIN recebe
 * `createdBy: { id, name, email } | null` (master/básico: a chave nem vem) e só o admin pode mandar `?authorEmail=`
 * (contém, sem diferenciar maiúsculas; compatível com page/limit e com pagination=cursor). Master/básico com
 * authorEmail preenchido → 403 INSUFFICIENT_ROLE. Hoje NENHUMA tela usa esses GETs (as listas leem o SQLite local);
 * quem vier a usar: parseCreatedBy (userAuthor.ts) para `createdBy` e authorEmailParam abaixo para o filtro.
 */
export const AUTHOR_REST = { field: 'createdBy', filterParam: 'authorEmail' } as const

/** `{ authorEmail }` só para o admin e só preenchido; para os demais `{}` (evita o 403 da API). */
export function authorEmailParam(role: string | null | undefined, email: string | null | undefined): { authorEmail?: string } {
  const value = email?.trim()
  return role === 'admin' && value ? { authorEmail: value } : {}
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
