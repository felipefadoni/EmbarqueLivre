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
 * `catalogs` sem autor) e `sync-columns.ts` (created_by_* readOnly no upload).
 * Backfill (`20261113160000_backfill_record_authors`): farms/herds/animals/shipments sem autor recebem o master mais
 * antigo da conta; vacinações já tinham autor obrigatório. Linhas sem master na conta continuam null.
 */
export type AuthorTable = 'farms' | 'animals' | 'herds' | 'vaccinations' | 'shipments' | 'vaccines'
export type AuthorColumns = { email: string | null; name: string | null }

export const AUTHOR_CONTRACT: Record<AuthorTable, AuthorColumns> = {
  farms: { email: 'created_by_email', name: 'created_by_name' },
  animals: { email: 'created_by_email', name: 'created_by_name' },
  herds: { email: 'created_by_email', name: 'created_by_name' },
  vaccinations: { email: 'created_by_email', name: 'created_by_name' },
  shipments: { email: 'created_by_email', name: 'created_by_name' },
  /** CONTRATO PENDENTE (ver VACCINE_AUTHOR_CONTRACT): nomes prováveis; sem dado chegando, a tela mostra "Autor não registrado". */
  vaccines: { email: 'created_by_email', name: 'created_by_name' },
}

/** Tabelas cujo autor ainda depende do contrato da API (o diagnóstico mostra "aguardando" em vez de erro). */
export const AUTHOR_PENDING_TABLES: readonly AuthorTable[] = ['vaccines']

/**
 * Autor do CATÁLOGO de vacinas (tabela vaccines) — CONTRATO PENDENTE (13/11/2026 17:07): a API vai mandar só para o admin.
 *
 * Problema: vaccines já chega a TODOS pelo stream `catalogs` (sem autor). No PowerSync, a mesma linha (tabela + id) vinda
 * de dois buckets fica uma cópia por bucket no ps_oplog, mas só UMA vai para ps_data__vaccines: a de MAIOR op_id, e o PUT
 * substitui o JSON INTEIRO (não há merge de colunas). Se `admin_all` também mandar vaccines com autor, o autor some/volta
 * conforme o bucket que recebeu a op mais recente (edição da vacina, compactação/defrag do bucket, reprocessamento).
 *
 * Formas suportadas (todas lidas pelas MESMAS consultas, ver vaccineAuthorSql em queries.ts):
 * - 'table'   (A, RECOMENDADA): tabela própria só do admin, ex. `SELECT vaccine_id AS id, vaccine_created_by_name AS
 *             created_by_name, vaccine_created_by_email AS created_by_email FROM vaccines AS vaccine_authors WHERE
 *             auth.parameter('role') = 'admin'` no stream admin_all. Linha com id próprio: sem conflito com `catalogs`.
 *             O app faz LEFT JOIN só na consulta do admin.
 * - 'columns' (B): created_by_* direto em vaccines (só é estável se o admin NÃO receber vaccines também por `catalogs`).
 * - 'auto'    (padrão enquanto pendente): lê as duas (COALESCE tabela → colunas), funciona com A ou B sem trocar nada.
 * Trocar a forma = mudar só `source` abaixo (e `joinColumn`/`table` se a API usar outros nomes).
 */
export type VaccineAuthorSource = 'auto' | 'table' | 'columns'

export const VACCINE_AUTHOR_CONTRACT: {
  pending: boolean
  source: VaccineAuthorSource
  /** Forma A: nome da tabela no app. */
  table: string
  /** Forma A: coluna da tabela de autor que aponta para vaccines.id ('id' se a linha usa o próprio id da vacina). */
  joinColumn: 'id' | 'vaccine_id'
  name: string
  email: string
} = {
  pending: true,
  source: 'auto', // ← ÚNICA linha a trocar quando o contrato chegar ('table' ou 'columns').
  table: 'vaccine_authors',
  joinColumn: 'id',
  name: 'created_by_name',
  email: 'created_by_email',
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
