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
  /** Descendente (ex.: data mais recente primeiro). Pode misturar com ascendentes (ver keysetQuery). */
  desc?: boolean
}

export type KeysetSpec = {
  /** `SELECT … FROM … JOIN …`, sem WHERE. */
  base: string
  /** Parâmetros que aparecem em `base` (ex.: a data de hoje da carência). */
  baseParams: unknown[]
  where: string[]
  params: unknown[]
  groupBy?: string
  /** A última deve ser única (o `id`). Cada chave pode ser ascendente ou descendente (`desc`). */
  keys: KeyPart[]
}

export type Cursor = unknown[]

export type SqlQuery = { sql: string; params: unknown[] }

function keyExpr(key: KeyPart): string {
  return `COALESCE(${key.expr}, '')${key.nocase ? ' COLLATE NOCASE' : ''}`
}

export function orderBy(keys: KeyPart[]): string {
  return keys.map((key) => `${keyExpr(key)}${key.desc ? ' DESC' : ''}`).join(', ')
}

/**
 * "Depois do cursor" na ordem das chaves.
 * - Todas na mesma direção: comparação de linha `(k1, …, id) > (?, …)` (ou `<` se todas desc).
 * - Direções misturadas (ex.: Embarques: data desc, nome asc, id asc): expansão lexicográfica
 *   `k1 ≻ v1 OR (k1 = v1 AND k2 ≻ v2) OR …`, onde ≻ é `>` (asc) ou `<` (desc).
 * "Até o cursor (inclusive)" é a negação disso: `NOT (depois)`.
 */
function afterClause(keys: KeyPart[], cursor: Cursor): { sql: string; params: unknown[] } {
  const allAsc = keys.every((key) => !key.desc)
  const allDesc = keys.every((key) => key.desc)
  if (allAsc || allDesc) {
    const tuple = `(${keys.map(keyExpr).join(', ')})`
    const marks = `(${keys.map(() => '?').join(', ')})`
    return { sql: `${tuple} ${allAsc ? '>' : '<'} ${marks}`, params: [...cursor] }
  }
  const ors: string[] = []
  const params: unknown[] = []
  keys.forEach((key, i) => {
    const ands: string[] = []
    for (let j = 0; j < i; j++) {
      ands.push(`${keyExpr(keys[j])} = ?`)
      params.push(cursor[j])
    }
    ands.push(`${keyExpr(key)} ${key.desc ? '<' : '>'} ?`)
    params.push(cursor[i])
    ors.push(`(${ands.join(' AND ')})`)
  })
  return { sql: `(${ors.join(' OR ')})`, params }
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
  if (opts.after) {
    const after = afterClause(spec.keys, opts.after)
    where.push(after.sql)
    params.push(...after.params)
  }
  if (opts.until) {
    const after = afterClause(spec.keys, opts.until)
    where.push(`NOT ${after.sql}`)
    params.push(...after.params)
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
