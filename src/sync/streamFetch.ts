/**
 * fetch do stream do PowerSync (POST /sync/stream) no React Native. Puro (testável no Node): o fetch real é injetado.
 *
 * Por que existe (Android, 16/11): o `fetch()` do expo/fetch nunca resolvia e o SDK abortava aos 30 s
 * ("Sync stream connection timed out after 30000ms"; no serviço: close_reason "client closing stream", stream_ms 30009).
 *  1. Build debuggable (dev client): o expo-dev-launcher injeta `ExpoNetworkInspectOkHttpNetworkInterceptor` em todo
 *     OkHttpClient. Ele lê até 1 MB do corpo (`peekResponseBody`) ANTES de entregar a resposta, a menos que o tipo seja
 *     de streaming (`text/event-stream`...) ou `Transfer-Encoding: chunked`. O stream vem em HTTP/2 (sem
 *     Transfer-Encoding, sem Content-Length) como `application/vnd.powersync.bson-stream` -> os cabeçalhos ficam presos
 *     até 1 MB ou o fim do stream. O inspetor também pula quando o `Accept` do PEDIDO começa com `text/event-stream`.
 *     O serviço negocia só entre ndjson e bson (Negotiator), então esse prefixo com q baixo não muda o formato.
 *  2. Release também: o `TransparentCompressionInterceptor` do expo/fetch pede `zstd, br, gzip` por padrão; o caminho
 *     `br` segura o stream até o fim (expo/expo#50568). O serviço oferece identity/gzip/zstd; fixamos `gzip`
 *     (GzipSource entrega leituras parciais; o serviço usa Z_SYNC_FLUSH por linha).
 * Só o pedido de streaming é alterado; checkpoint-request e demais chamadas seguem iguais.
 */

/** Prefixo que tira a resposta do inspetor de rede do dev client sem mudar a negociação do serviço. */
export const INSPECTOR_SKIP_ACCEPT = 'text/event-stream;q=0.1'
export const STREAM_ACCEPT_ENCODING = 'gzip'

type HeaderMap = Record<string, string>

function toHeaderMap(headers: unknown): HeaderMap {
  const out: HeaderMap = {}
  if (!headers) return out
  if (typeof (headers as { forEach?: unknown }).forEach === 'function' && !Array.isArray(headers)) {
    ;(headers as { forEach: (cb: (value: string, key: string) => void) => void }).forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  const entries = Array.isArray(headers) ? (headers as [string, string][]) : Object.entries(headers as HeaderMap)
  for (const [key, value] of entries) out[key] = String(value)
  return out
}

function take(map: HeaderMap, name: string): string | undefined {
  let found: string | undefined
  for (const key of Object.keys(map)) {
    if (key.toLowerCase() === name) {
      found = map[key]
      delete map[key]
    }
  }
  return found
}

/** Cabeçalhos do POST /sync/stream: Accept começa com text/event-stream (q baixo) e Accept-Encoding explícito. */
export function streamingRequestHeaders(headers: unknown): HeaderMap {
  const map = toHeaderMap(headers)
  const accept = take(map, 'accept')?.trim()
  const encoding = take(map, 'accept-encoding')?.trim()
  map.accept = !accept
    ? `${INSPECTOR_SKIP_ACCEPT}, application/vnd.powersync.bson-stream;q=0.9, application/x-ndjson;q=0.8`
    : accept.startsWith('text/event-stream')
      ? accept
      : `${INSPECTOR_SKIP_ACCEPT}, ${accept}`
  // br nunca: o decodificador do expo/fetch no Android segura o stream. zstd/identity explícitos são respeitados.
  map['accept-encoding'] = encoding && !/\bbr\b/i.test(encoding) ? encoding : STREAM_ACCEPT_ENCODING
  return map
}

export type StreamFetchOptions = { resource: string; request: RequestInit; expectStreamingResponse?: boolean }
type FetchFn = (resource: string, init: RequestInit) => Promise<Response>

/** Implementação de fetch para `new PowerSyncDatabase({ remote: { fetchImplementation } })`. */
export function createStreamingFetch(getFetch: () => FetchFn) {
  return {
    supportsStreams: true as const,
    run({ resource, request, expectStreamingResponse }: StreamFetchOptions): Promise<Response> {
      const fetchFn = getFetch()
      if (!expectStreamingResponse) return fetchFn(resource, request)
      return fetchFn(resource, { ...request, headers: streamingRequestHeaders(request.headers) })
    },
  }
}
