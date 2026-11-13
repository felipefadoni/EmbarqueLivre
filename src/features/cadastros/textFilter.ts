/**
 * Filtro de texto local (offline), sem diferenciar maiúsculas nem acentos. Puro, testável no Node.
 *
 * Por que em JS e não no SQL: o `lower()`/`LIKE` do SQLite só dobram ASCII (não tratam "Á" nem "ç") e o SDK do
 * PowerSync não expõe registro de função SQL própria. As listas de fazendas já estão em memória (`useLocalFarms`),
 * então dobramos o texto aqui e mandamos ao SQL só os ids que casaram (um parâmetro JSON, via `json_each`).
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g

/** Minúsculas, sem acentos, espaços colapsados. "  São  JOÃO " → "sao joao". */
export function foldText(value: unknown): string {
  let text = String(value ?? '')
  try {
    text = text.normalize('NFD').replace(COMBINING_MARKS, '')
  } catch {
    // normalize indisponível: segue só com minúsculas.
  }
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Busca parcial: `query` vazia casa tudo. */
export function matchesText(value: unknown, query: string | null | undefined): boolean {
  const q = foldText(query)
  if (!q) return true
  return foldText(value).includes(q)
}

/**
 * Ids das fazendas cujo nome contém `query`. `undefined` = filtro inativo (sem restrição);
 * `[]` = filtro ativo sem nenhuma fazenda (a lista fica vazia).
 */
export function matchingFarmIds(farms: readonly { id: string; name: string }[], query: string | null | undefined): string[] | undefined {
  if (!foldText(query)) return undefined
  return farms.filter((farm) => matchesText(farm.name, query)).map((farm) => farm.id)
}

/** Texto curto para o resumo do painel fechado. */
export function textFilterLabel(label: string, query: string | null | undefined): string {
  const q = String(query ?? '').trim().replace(/\s+/g, ' ')
  return q ? `${label} "${q}"` : ''
}
