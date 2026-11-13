/**
 * Diagnóstico do autor recebido pelo sync (só admin, tela Configurações). Puro, testável no Node.
 *
 * Lê o JSON bruto das linhas que o PowerSync gravou (`ps_data__<tabela>`), não a view: assim separa
 * "a chave nem veio do servidor" (sync-config/PowerSync do servidor sem as colunas) de "veio, mas vazia"
 * (registro sem autor: anterior ao contrato / sem backfill). Também mostra o registro mais novo recebido, o que
 * denuncia um PowerSync do servidor parado (o aparelho sincroniza, mas nada novo chega).
 * Não mostra nenhum dado pessoal: só contagens e datas.
 */
import { AUTHOR_CONTRACT, AUTHOR_PENDING_TABLES, VACCINE_AUTHOR_CONTRACT, type AuthorTable, type VaccineAuthorSource } from '../api/authorContract'
import type { UserRole } from '../api/types'
import { normalizeTimestamp, tableOf, type SyncEntity } from './mapping'

/**
 * Card do diagnóstico: SÓ o admin. Master/básico nunca veem nem rodam as consultas; papel ainda carregando
 * (undefined/null) também não mostra.
 */
export function canSeeAuthorDiagnostics(role: UserRole | string | null | undefined): boolean {
  return role === 'admin'
}

const DIAG_ENTITIES: { table: AuthorTable; entity: SyncEntity; label: string }[] = [
  { table: 'farms', entity: 'farms', label: 'Fazendas' },
  { table: 'animals', entity: 'animals', label: 'Animais' },
  { table: 'herds', entity: 'herds', label: 'Rebanhos' },
  { table: 'vaccinations', entity: 'vaccinations', label: 'Vacinações' },
  { table: 'shipments', entity: 'shipments', label: 'Embarques' },
]

export type AuthorDiagnosticRow = {
  label: string
  /** Linhas baixadas do servidor. */
  total: number
  /** Linhas cujo JSON tem a chave do e-mail do autor (mesmo que null). 0 com total > 0 = servidor não envia. */
  withKey: number
  /** Linhas com nome ou e-mail do autor preenchido. */
  withAuthor: number
  /** created_at mais recente recebido (ISO). */
  newest: string | null
  /**
   * Contrato da API ainda pendente e nada recebido (ex.: catálogo de vacinas): mostra "aguardando a API" e fica FORA
   * do veredito (não vira "servidor não envia").
   */
  pending?: boolean
}

/** Uma consulta (UNION ALL) sobre o JSON do PowerSync. Tabelas sem coluna de autor no contrato ficam de fora. */
export function authorDiagnosticsQuery(): { sql: string; params: unknown[] } {
  // O catálogo de vacinas tem consulta própria (vaccineCatalogDiagnosticsQuery): pode ler uma tabela que ainda não existe.
  const parts = DIAG_ENTITIES.filter(({ table }) => AUTHOR_CONTRACT[table].email || AUTHOR_CONTRACT[table].name).map(({ table, entity, label }) => {
    const email = AUTHOR_CONTRACT[table].email
    const name = AUTHOR_CONTRACT[table].name
    const keyCol = email ?? name ?? ''
    const filled = [email, name]
      .filter((col): col is string => Boolean(col))
      .map((col) => `COALESCE(json_extract(data, '$.${col}'), '') <> ''`)
      .join(' OR ')
    return `SELECT '${label}' AS label, COUNT(*) AS total,
      COALESCE(SUM(json_type(data, '$.${keyCol}') IS NOT NULL), 0) AS withKey,
      COALESCE(SUM(${filled}), 0) AS withAuthor,
      MAX(json_extract(data, '$.created_at')) AS newest
      FROM ps_data__${tableOf(entity)}`
  })
  return { sql: parts.join('\nUNION ALL\n'), params: [] }
}

export const VACCINE_CATALOG_LABEL = 'Vacinas (catálogo)'

/**
 * Catálogo de vacinas (contrato PENDENTE): conta o autor na forma configurada em VACCINE_AUTHOR_CONTRACT.source —
 * tabela só do admin (ps_data__vaccine_authors, LEFT JOIN), colunas da própria vaccines, ou as duas ('auto').
 * Consulta separada: se a tabela do autor não existir (ou falhar), o card mostra "aguardando a API" e o resto segue.
 */
export function vaccineCatalogDiagnosticsQuery(source: VaccineAuthorSource = VACCINE_AUTHOR_CONTRACT.source): { sql: string; params: unknown[] } {
  const { name, email, joinColumn } = VACCINE_AUTHOR_CONTRACT
  const useTable = source !== 'columns'
  const useColumns = source !== 'table'
  const pick = (col: string) =>
    `COALESCE(${[useTable ? `NULLIF(json_extract(va.data, '$.${col}'), '')` : '', useColumns ? `NULLIF(json_extract(v.data, '$.${col}'), '')` : '']
      .filter(Boolean)
      .join(', ')}, '')`
  const keyParts = [useTable ? 'va.id IS NOT NULL' : '', useColumns ? `json_type(v.data, '$.${email}') IS NOT NULL` : ''].filter(Boolean)
  const joinOn = joinColumn === 'id' ? 'va.id = v.id' : `json_extract(va.data, '$.${joinColumn}') = v.id`
  const pending = AUTHOR_PENDING_TABLES.includes('vaccines') ? 1 : 0
  return {
    sql: `SELECT '${VACCINE_CATALOG_LABEL}' AS label, COUNT(*) AS total,
      COALESCE(SUM(${keyParts.join(' OR ')}), 0) AS withKey,
      COALESCE(SUM(${pick(email)} <> '' OR ${pick(name)} <> ''), 0) AS withAuthor,
      MAX(json_extract(v.data, '$.created_at')) AS newest,
      ${pending} AS pendingContract
      FROM ps_data__${tableOf('vaccines')} v${useTable ? ` LEFT JOIN ps_data__${tableOf('vaccineAuthors')} va ON ${joinOn}` : ''}`,
    params: [],
  }
}

/** Linha "aguardando a API" quando a consulta do catálogo falha (ex.: tabela do autor ainda não criada). */
export function pendingVaccineCatalogRow(): AuthorDiagnosticRow {
  return { label: VACCINE_CATALOG_LABEL, total: 0, withKey: 0, withAuthor: 0, newest: null, pending: true }
}

export type AuthorVerdict = 'empty' | 'server-not-sending' | 'sent-but-empty' | 'partial' | 'ok'

export function authorVerdict(allRows: readonly AuthorDiagnosticRow[]): AuthorVerdict {
  // Tabelas com contrato pendente e nada recebido não contam (não é falha do servidor).
  const rows = allRows.filter((row) => !row.pending)
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  if (total === 0) return 'empty'
  const withKey = rows.reduce((sum, row) => sum + row.withKey, 0)
  const withAuthor = rows.reduce((sum, row) => sum + row.withAuthor, 0)
  if (withKey === 0) return 'server-not-sending'
  if (withAuthor === 0) return 'sent-but-empty'
  return withAuthor < total ? 'partial' : 'ok'
}

export const AUTHOR_VERDICT_TEXT: Record<AuthorVerdict, string> = {
  empty: 'Nenhum registro baixado ainda.',
  'server-not-sending':
    'O servidor de sincronização NÃO está enviando o autor (nem a chave chega ao aparelho). Verifique o PowerSync do servidor (configuração de sync e se está replicando).',
  'sent-but-empty': 'O servidor envia o campo, mas vazio: os registros não têm autor gravado no banco (antigos ou sem backfill).',
  partial: 'Autor chegando. Registros antigos sem autor aparecem como "Autor não registrado".',
  ok: 'Autor chegando em todos os registros.',
}

/** "13/11 15:41" no fuso do aparelho. */
export function formatDiagnosticDate(iso: string | null | undefined): string {
  const normalized = normalizeTimestamp(iso)
  if (!normalized) return '—'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function authorDiagnosticLine(row: AuthorDiagnosticRow): string {
  if (row.pending) return `${row.label}: aguardando a API enviar o autor (${row.total} no aparelho)`
  return `${row.label}: ${row.withAuthor}/${row.total} com autor · campo recebido em ${row.withKey}/${row.total}`
}

/** Registro mais novo entre todas as tabelas (indica até quando o servidor de sync tem dados). */
export function newestOf(rows: readonly AuthorDiagnosticRow[]): string | null {
  return rows.reduce<string | null>((best, row) => (row.newest && (!best || row.newest > best) ? row.newest : best), null)
}

export function toDiagnosticRow(raw: Record<string, unknown>): AuthorDiagnosticRow {
  return {
    label: String(raw.label ?? ''),
    total: Number(raw.total ?? 0),
    withKey: Number(raw.withKey ?? 0),
    withAuthor: Number(raw.withAuthor ?? 0),
    newest: typeof raw.newest === 'string' && raw.newest ? raw.newest : null,
    // Pendente só enquanto nada chegou: a primeira linha com o campo já entra no veredito normal.
    ...(Number(raw.pendingContract ?? 0) === 1 && Number(raw.withKey ?? 0) === 0 ? { pending: true } : {}),
  }
}
