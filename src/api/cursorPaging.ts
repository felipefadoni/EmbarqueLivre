/**
 * Paginação de listas REST com cursor (keyset) e fallback para page/limit. Puro (sem cliente HTTP), testável no Node.
 *
 * Contrato da API (12/11/2026): 1ª página `?pagination=cursor&limit=N` (máx. 100); próximas `?cursor=<nextCursor>&limit=N`
 * com os MESMOS filtros; resposta `{ data, nextCursor }` (null no fim, sem total). Cursor opaco; inválido →
 * 400 INVALID_CURSOR. O modo antigo (page/limit → `{ data, meta }`) continua existindo.
 * Endpoints com keyset na API (12/11/2026 22h): /farms, /animals, /herds, /account/users, /vaccinations, /shipments,
 * /vaccines, /animal-types, /users/masters, /accounts. Ordem no modo cursor: id (ULID) desc = mais novos primeiro.
 * Sem paginação: /shipments/:id/eligible-animals e os arrays dentro dos detalhes.
 *
 * Fallbacks (a VPS pode estar numa versão antiga; forbidNonWhitelisted → 400 em parâmetro desconhecido):
 * - 400 de validação citando um parâmetro novo → refaz a MESMA página em page/limit e fica assim até o app reiniciar;
 * - resposta com `meta` em vez de `nextCursor` → segue em page/limit;
 * - 400 INVALID_CURSOR → recomeça da 1ª página sem cursor e avisa (`restarted`) para a lista substituir os itens.
 * Trocar filtro = a tela recria o loader e o useInfiniteList recomeça sem cursor.
 */

export type PagingMode = 'cursor' | 'legacy'

export type PageRequest = { page?: number; cursor?: string | null; limit?: number }

export const CURSOR_PAGING = {
  modeParam: 'pagination',
  cursorMode: 'cursor',
  cursorParam: 'cursor',
  pageParam: 'page',
  limitParam: 'limit',
  firstPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
  /** Parâmetros de paginação que uma API antiga recusaria. */
  pagingParams: ['pagination', 'cursor'],
  invalidCursorCode: 'INVALID_CURSOR',
} as const

/**
 * Pedido da 1ª página: usado na carga inicial, no puxar-para-atualizar, no "tentar de novo" e quando o filtro muda
 * (useInfiniteList). Nunca leva cursor: no modo cursor vira `pagination=cursor` (mais novos primeiro).
 */
export const FIRST_PAGE_REQUEST: Readonly<PageRequest> = Object.freeze({ page: 1, cursor: undefined })

export function clampLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return CURSOR_PAGING.defaultLimit
  return Math.min(Math.max(1, Math.trunc(limit)), CURSOR_PAGING.maxLimit)
}

/** Parâmetros de paginação da página pedida. Modo cursor sem cursor = 1ª página (`pagination=cursor`). */
export function pagingParams(paging: PageRequest, mode: PagingMode): Record<string, string | number> {
  const limit = clampLimit(paging.limit)
  if (mode === 'cursor') {
    return paging.cursor
      ? { [CURSOR_PAGING.cursorParam]: paging.cursor, [CURSOR_PAGING.limitParam]: limit }
      : { [CURSOR_PAGING.modeParam]: CURSOR_PAGING.cursorMode, [CURSOR_PAGING.limitParam]: limit }
  }
  return { [CURSOR_PAGING.pageParam]: paging.page ?? CURSOR_PAGING.firstPage, [CURSOR_PAGING.limitParam]: limit }
}

/** Acrescenta filtros sem vazios (strings aparadas). */
export function withFilters(base: Record<string, string | number>, filters: Record<string, string | number | null | undefined>) {
  const out = { ...base }
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue
    const v = typeof value === 'string' ? value.trim() : value
    if (v !== '') out[key] = v
  }
  return out
}

/** Formato da resposta: `nextCursor` → keyset; `meta` → page/limit; outro → null. */
export function responseMode(data: unknown): PagingMode | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if ('nextCursor' in data) return 'cursor'
  if ('meta' in data) return 'legacy'
  return null
}

type ErrorLike = { status?: unknown; code?: unknown; fieldErrors?: unknown }

/** 400 de validação (API antiga) recusando um dos parâmetros dados ("property X should not exist"). */
export function isUnknownParamRejection(error: unknown, params: readonly string[] = CURSOR_PAGING.pagingParams): boolean {
  const e = (error ?? {}) as ErrorLike
  if (e.status !== 400 || e.code !== 'VALIDATION_ERROR') return false
  const fields = e.fieldErrors && typeof e.fieldErrors === 'object' ? (e.fieldErrors as Record<string, unknown>) : {}
  return params.some((param) => {
    if (param in fields) return true
    return Object.values(fields).some(
      (messages) => Array.isArray(messages) && messages.some((m) => String(m).startsWith(`property ${param} should not exist`)),
    )
  })
}

export function isInvalidCursor(error: unknown): boolean {
  return ((error ?? {}) as ErrorLike).code === CURSOR_PAGING.invalidCursorCode
}

export type PagingState = { mode: PagingMode }

export type CursorFetchResult = {
  data: unknown
  /** Modo efetivo desta página. */
  mode: PagingMode
  /** A página pedida tinha cursor inválido: veio a 1ª página de novo (substituir a lista). */
  restarted: boolean
}

/**
 * Busca uma página com os fallbacks acima. `state` é compartilhado por endpoint (o modo antigo "gruda" na sessão).
 * `build(mode, paging)` monta a query completa (paginação + filtros) no modo dado; `get` devolve o corpo da resposta
 * e lança o erro normalizado da API. `newParams`: parâmetros cuja recusa (400) leva ao modo antigo.
 */
export async function fetchCursorPage(
  get: (params: Record<string, string | number>) => Promise<unknown>,
  build: (mode: PagingMode, paging: PageRequest) => Record<string, string | number>,
  paging: PageRequest,
  state: PagingState,
  newParams: readonly string[] = CURSOR_PAGING.pagingParams,
): Promise<CursorFetchResult> {
  let restarted = false
  let request: PageRequest = state.mode === 'cursor' ? paging : { ...paging, cursor: null }
  let data: unknown
  try {
    data = await get(build(state.mode, request))
  } catch (error) {
    if (state.mode === 'cursor' && isUnknownParamRejection(error, newParams)) {
      state.mode = 'legacy'
      request = { ...paging, cursor: null }
      data = await get(build('legacy', request))
    } else if (state.mode === 'cursor' && request.cursor && isInvalidCursor(error)) {
      restarted = true
      request = { page: CURSOR_PAGING.firstPage, cursor: null, limit: paging.limit }
      data = await get(build('cursor', request))
    } else {
      throw error
    }
  }
  if (state.mode === 'cursor' && responseMode(data) === 'legacy') state.mode = 'legacy'
  return { data, mode: state.mode, restarted }
}
