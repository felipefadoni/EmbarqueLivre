/**
 * Paginação KEYSET das listas locais (SQLite do PowerSync). Puro, testável no Node com SQLite real.
 *
 * Ordem: a MESMA que as listas já usavam (nome/código sem diferenciar maiúsculas, `id` no fim para desempate),
 * para master/básico verem tudo igual. O cursor é composto por essas chaves: `(k1, …, id) > (?, …, ?)`.
 * Sem OFFSET: o custo de uma página não cresce com a posição na lista.
 *
 * Null estável: cada chave entra como `COALESCE(expr, '')` (no ORDER BY e no cursor), porque `NULL` numa comparação
 * de linha (row value) dá NULL e a linha sumiria. `id` nunca é null. `created_at` não entra na chave: linha criada
 * offline pode não ter `created_at` até o servidor devolvê-la.
 *
 * Reatividade (useKeysetList): a tela observa UMA consulta delimitada pelo cursor do fim do que já foi carregado
 * (`(chaves) <= until`), e não páginas coladas. Inserção/edição local ou download dentro da faixa aparece no lugar
 * certo; o que sai da faixa some; nada se repete nem é pulado, porque não há fronteira entre páginas.
 */

export type KeyPart = {
  /** Expressão SQL da chave (ex.: `f.name`). */
  expr: string
  /** Campo da linha devolvida com o valor da chave (ex.: `name`). */
  field: string
  nocase?: boolean
}

export type KeysetSpec = {
  /** `SELECT … FROM … JOIN …`, sem WHERE. */
  base: string
  /** Parâmetros que aparecem em `base` (ex.: a data de hoje da carência). */
  baseParams: unknown[]
  where: string[]
  params: unknown[]
  groupBy?: string
  /** Todas ascendentes; a última deve ser única (o `id`). */
  keys: KeyPart[]
}

export type Cursor = unknown[]

export type SqlQuery = { sql: string; params: unknown[] }

function keyExpr(key: KeyPart): string {
  return `COALESCE(${key.expr}, '')${key.nocase ? ' COLLATE NOCASE' : ''}`
}

export function orderBy(keys: KeyPart[]): string {
  return keys.map(keyExpr).join(', ')
}

/** Valor do cursor da linha (mesma normalização do SQL: null → ''). */
export function cursorOf(keys: KeyPart[], row: Record<string, unknown>): Cursor {
  return keys.map((key) => row[key.field] ?? '')
}

/**
 * - `after`: só linhas DEPOIS do cursor (próxima página);
 * - `until`: só linhas ATÉ o cursor, inclusive (faixa já carregada, observada pela tela);
 * - `limit`: LIMIT exato (quem chama soma +1 se quiser saber se há mais).
 */
export function keysetQuery(spec: KeysetSpec, opts: { after?: Cursor | null; until?: Cursor | null; limit?: number } = {}): SqlQuery {
  const where = [...spec.where]
  const params = [...spec.baseParams, ...spec.params]
  const tuple = `(${spec.keys.map(keyExpr).join(', ')})`
  const marks = `(${spec.keys.map(() => '?').join(', ')})`
  if (opts.after) {
    where.push(`${tuple} > ${marks}`)
    params.push(...opts.after)
  }
  if (opts.until) {
    where.push(`${tuple} <= ${marks}`)
    params.push(...opts.until)
  }
  let sql = `${spec.base} ${where.length ? `WHERE ${where.join(' AND ')} ` : ''}${spec.groupBy ? `GROUP BY ${spec.groupBy} ` : ''}ORDER BY ${orderBy(spec.keys)}`
  if (opts.limit != null) {
    sql += ' LIMIT ?'
    params.push(Math.max(0, Math.trunc(opts.limit)))
  }
  return { sql, params }
}

/** Primeira página (sem cursor) ou faixa carregada (até `until`). Primeira página traz +1 para saber se há mais. */
export function windowQuery(spec: KeysetSpec, until: Cursor | null, pageSize: number): SqlQuery {
  return until ? keysetQuery(spec, { until }) : keysetQuery(spec, { limit: pageSize + 1 })
}

/** Existe linha depois do fim carregado? (LIMIT 1, barato.) */
export function hasMoreQuery(spec: KeysetSpec, until: Cursor): SqlQuery {
  return keysetQuery(spec, { after: until, limit: 1 })
}

/** Estado da janela a partir das linhas observadas. */
export function sliceWindow<T>(rows: readonly T[], until: Cursor | null, pageSize: number, probeHasMore: boolean): { rows: T[]; hasMore: boolean } {
  if (until) return { rows: rows as T[], hasMore: probeHasMore }
  return { rows: rows.slice(0, pageSize) as T[], hasMore: rows.length > pageSize }
}

/** Próximo `until`: cursor da última linha da próxima página (ou null se acabou). */
export function nextUntil(keys: KeyPart[], nextPage: readonly Record<string, unknown>[]): Cursor | null {
  const last = nextPage[nextPage.length - 1]
  return last ? cursorOf(keys, last) : null
}
