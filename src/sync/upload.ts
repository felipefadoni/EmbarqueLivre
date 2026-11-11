/**
 * Upload da fila do PowerSync para POST /api/v1/powersync/upload.
 *
 * Corpo: { batch: [{ op, table, id, opData }] } — no máximo UPLOAD_BATCH_LIMIT ops por POST.
 * Resposta: { results: [{ id, table, op, status: 'applied' | 'rejected', error?: { statusCode, error, message } }] }
 *   (2xx sem `results` = lote inteiro aplicado; com `results`, op sem resultado vira pendência SYNC_NO_RESULT).
 *
 * Regras (Felipe):
 * - Operação recusada NÃO trava a fila: vai para a tabela local `sync_rejections` (com a mensagem pt-BR)
 *   e a transação é concluída (complete()). O PowerSync então devolve a linha ao estado do servidor
 *   no próximo checkpoint — ver docs/POWERSYNC.md ("Pendências").
 * - 408, 429, 5xx ou sem rede: lança RetryableUploadError para o PowerSync tentar de novo
 *   (nada é concluído; reenvio precisa ser idempotente no servidor).
 * - 401 UNAUTHENTICATED (usuário removido/inativo, ou refresh falhou): lança SessionEndedUploadError,
 *   sem retry; o connector encerra a sessão e mantém os dados locais.
 * - Lote inteiro recusado com 4xx (404/405 de rota ou proxy, 403 de firewall, 400 INVALID_BATCH, 413…): NÃO é problema
 *   do cadastro. Nada vira Pendência; a transação fica na fila (BatchBlockedUploadError, com espera) e a tela mostra o
 *   motivo. Pendência = só recusa da API para AQUELA operação (results[].status = 'rejected') com 4xx definitivo.
 * - Recusa por operação com 401 → sessão encerrada; com 408/429/5xx (ex.: SYNC_UNAVAILABLE) → fila (retry), não Pendência.
 * - Recusa por operação com 403/404/405/410… (FARM_NOT_FOUND, ANIMAL_TYPE_NOT_FOUND…) → fila, não Pendência: é referência
 *   que o servidor ainda não tem ou acesso, não dado inválido. Concluir faria o checkpoint seguinte APAGAR a linha local.
 *   DELETE com 404 = já apagado (aplicado). Só 400/409/422 viram Pendência (Corrigir).
 * - 2xx sem JSON (portal cativo, proxy devolvendo HTML) ou sem o resultado de alguma op → fila (retry). Antes isso
 *   contava como "aplicado" (perda silenciosa) ou virava Pendência SYNC_NO_RESULT.
 *
 * Puro (sem React Native) para testar com servidor simulado.
 */
import { publicApiMessage } from '../api/errors'
import { entityOfTable, NEVER_UPLOAD_COLUMNS, UPLOAD_BATCH_LIMIT, colOf } from './mapping'

export type UploadOpType = 'PUT' | 'PATCH' | 'DELETE'

export type CrudLike = { id: string; op: UploadOpType | string; table: string; opData?: Record<string, unknown> }
export type TransactionLike = { crud: CrudLike[]; complete: (checkpoint?: string) => Promise<void> }

export type UploadOp = { op: UploadOpType; table: string; id: string; opData?: Record<string, unknown> }

export type UploadResult = {
  id: string
  table: string
  op: string
  status: 'applied' | 'rejected'
  error?: UploadError
}

export type UploadError = { statusCode?: number; error?: string; message?: string; details?: { field?: string } & Record<string, unknown> }

/** Resposta HTTP crua do POST (o connector converte erros do axios para isso). */
export type PostResponse = { status: number; data: unknown }
/** Deve lançar em falha de rede. */
export type PostBatch = (body: { batch: UploadOp[] }) => Promise<PostResponse>

export type RejectionRecord = {
  entity: string
  tableName: string
  rowId: string
  op: string
  opData: string | null
  statusCode: number
  errorCode: string
  message: string
  /** `error.details.field` (coluna snake_case) quando o servidor aponta o campo. */
  field: string | null
}

export class RetryableUploadError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'RetryableUploadError'
    this.status = status
  }
}

/**
 * Lote inteiro recusado com 4xx (não é recusa de um cadastro): a transação fica na fila. Subclasse de
 * RetryableUploadError para todos os caminhos tratarem como "não enviado ainda" (sem Pendência).
 */
export class BatchBlockedUploadError extends RetryableUploadError {
  code: string
  constructor(status: number, code: string, message: string) {
    super(status, message)
    this.name = 'BatchBlockedUploadError'
    this.code = code
  }
}

/** 401 UNAUTHENTICATED no upload: sessão encerrada, sem loop de retry. */
export class SessionEndedUploadError extends Error {
  status = 401
  code: string
  constructor(code = 'UNAUTHENTICATED') {
    super('Sua sessão expirou. Entre novamente.')
    this.name = 'SessionEndedUploadError'
    this.code = code
  }
}

/**
 * Recusa definitiva de UMA operação que o usuário resolve editando o cadastro (validação, duplicado, regra de negócio).
 * Só estas viram Pendência; o resto (403/404/…) fica na fila para não perder o cadastro local.
 */
export function isDefinitiveRejectionStatus(status: number): boolean {
  return status === 400 || status === 409 || status === 422
}

/** Mensagem do indicador quando uma op fica parada por referência ausente/acesso (não é Pendência). */
export function dependencyMessage(rejection: Pick<RejectionRecord, 'statusCode' | 'errorCode' | 'message'>): string {
  const base = rejection.message || `HTTP ${rejection.statusCode} ${rejection.errorCode}`
  if (/NOT_FOUND$/.test(rejection.errorCode)) {
    return `${base} (HTTP ${rejection.statusCode} ${rejection.errorCode}). O cadastro continua guardado no aparelho e será reenviado; se persistir, confira se a API e o PowerSync do app apontam para o mesmo servidor.`
  }
  return `${base} (HTTP ${rejection.statusCode} ${rejection.errorCode}). O cadastro continua guardado no aparelho e será reenviado.`
}

export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500
}

/** Ajustes do contrato: PATCH de fazenda nunca leva account_id nem owner_user_id. IDs em maiúsculas. */
export function toUploadOp(entry: CrudLike): UploadOp {
  const op = String(entry.op).toUpperCase() as UploadOpType
  let opData = entry.opData ? { ...entry.opData } : undefined
  if (opData && entityOfTable(entry.table) === 'farms') {
    const accountCol = colOf('farms', 'accountId')
    const ownerCol = colOf('farms', 'ownerUserId')
    if (op === 'PATCH') {
      delete opData[accountCol]
      delete opData[ownerCol]
    } else if (op === 'PUT') {
      // Prefere account_id; se só houver o alias legado, mantém owner_user_id.
      if (opData[accountCol]) delete opData[ownerCol]
    }
  }
  if (opData && entityOfTable(entry.table) === 'animals' && op === 'PUT') {
    // PUT /animals sem herd_id desvincula o animal. Se o opData local tem a coluna, ela segue; o repositório sempre a grava.
    const herdCol = colOf('animals', 'herdId')
    if (!(herdCol in opData) && entry.opData && herdCol in entry.opData) opData[herdCol] = entry.opData[herdCol]
  }
  if (opData && entityOfTable(entry.table) === 'shipments' && op === 'PATCH') {
    // Fazenda do embarque é imutável (SHIPMENT_FARM_IMMUTABLE): nunca enviar farm_id em alteração.
    delete opData[colOf('shipments', 'farmId')]
  }
  if (opData) {
    const entity = entityOfTable(entry.table)
    // Colunas só do servidor (finished_at, shipped_at, metadados da foto): nunca sobem.
    for (const column of entity ? NEVER_UPLOAD_COLUMNS[entity] ?? [] : []) delete opData[column]
  }
  if (op === 'DELETE') opData = undefined
  return { op, table: entry.table, id: String(entry.id).toUpperCase(), ...(opData ? { opData } : {}) }
}

/** PATCH sem nenhuma coluna (só tinha colunas do servidor, removidas). */
export function isEmptyPatch(op: UploadOp): boolean {
  return op.op === 'PATCH' && (!op.opData || Object.keys(op.opData).length === 0)
}

export function chunk<T>(items: T[], size = UPLOAD_BATCH_LIMIT): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function readResults(data: unknown): UploadResult[] {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  return Array.isArray(record.results) ? (record.results as UploadResult[]) : []
}

function isJsonObject(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && !Array.isArray(data))
}

/** Mensagem pt-BR do lote bloqueado (aparece no indicador de envio, não em Pendências). */
export function blockedMessage(status: number, code: string): string {
  if (status === 404 || status === 405) {
    return `A API não reconheceu o envio (HTTP ${status}). Confira o endereço do servidor no app (EXPO_PUBLIC_API_URL).`
  }
  if (status === 403) return `A API recusou o envio (HTTP 403 ${code}). Confira o acesso do usuário ou o firewall/proxy do servidor.`
  if (status === 413) return 'O envio ficou grande demais para o servidor (HTTP 413). Confira o limite do proxy.'
  return `A API recusou o lote de envio (HTTP ${status} ${code}). As alterações continuam guardadas e serão reenviadas.`
}

function hasResultsArray(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).results))
}

function errorBody(data: unknown) {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const message = Array.isArray(record.message) ? record.message.join('; ') : typeof record.message === 'string' ? record.message : undefined
  return {
    statusCode: typeof record.statusCode === 'number' ? record.statusCode : undefined,
    error: typeof record.error === 'string' ? record.error : undefined,
    message,
    details: record.details && typeof record.details === 'object' ? (record.details as UploadError['details']) : undefined,
  }
}

export function rejectionFrom(op: UploadOp, error: UploadError | undefined, fallbackStatus: number): RejectionRecord {
  const status = error?.statusCode ?? fallbackStatus
  const code = error?.error && /^[A-Z][A-Z0-9_]+$/.test(error.error) ? error.error : status === 409 ? 'CONFLICT' : status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : status === 403 ? 'INSUFFICIENT_ROLE' : 'INTERNAL_ERROR'
  const entity = entityOfTable(op.table) ?? op.table
  const message = publicApiMessage({ status, code: messageCodeFor(op.table, code), message: error?.message })
  return {
    entity,
    tableName: op.table,
    rowId: op.id,
    op: op.op,
    opData: op.opData ? JSON.stringify(op.opData) : null,
    statusCode: status,
    errorCode: code,
    message,
    field: typeof error?.details?.field === 'string' ? error.details.field : null,
  }
}

/**
 * URL do serviço PowerSync: a do .env (EXPO_PUBLIC_POWERSYNC_URL) tem precedência sobre a do token,
 * porque o token só traz o IP da rede depois que a API tiver POWERSYNC_URL configurado.
 */
export function resolvePowerSyncEndpoint(
  envUrl: string | undefined | null,
  tokenUrl: string | undefined | null,
  apiUrl?: string | null,
): string {
  const env = (envUrl || '').trim()
  const token = (tokenUrl || '').trim()
  if (!env) return token
  if (apiUrl && isPrivateUrl(env) !== isPrivateUrl(apiUrl)) {
    // API num servidor e PowerSync em outro (ex.: API na VPS, PowerSync no Mac da rede local). Perigoso: o app grava
    // num banco e baixa de outro; o checkpoint do PowerSync que não conhece o cadastro o APAGA do aparelho.
    if (token && !isLoopbackUrl(token)) {
      console.warn(`[sync] EXPO_PUBLIC_POWERSYNC_URL (${env}) é de outro ambiente que a API (${apiUrl}); usando o PowerSync do token (${token})`)
      return token
    }
    throw new PowerSyncEnvironmentMismatchError(env, apiUrl)
  }
  return env
}

/** EXPO_PUBLIC_POWERSYNC_URL e EXPO_PUBLIC_API_URL em ambientes diferentes e o token não traz URL utilizável. */
export class PowerSyncEnvironmentMismatchError extends Error {
  constructor(powersyncUrl: string, apiUrl: string) {
    super(
      `O PowerSync (${powersyncUrl}) e a API (${apiUrl}) estão em ambientes diferentes. A sincronização ficou pausada para não apagar dados do aparelho; as alterações continuam guardadas e são enviadas direto à API. Ajuste EXPO_PUBLIC_POWERSYNC_URL.`,
    )
    this.name = 'PowerSyncEnvironmentMismatchError'
  }
}

function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(url.trim())
  return (match?.[1] ?? '').toLowerCase()
}

function isLoopbackUrl(url: string): boolean {
  const host = hostOf(url)
  return host === 'localhost' || host.startsWith('127.') || host === '[::1]' || host === '0.0.0.0'
}

/** Endereço de rede local/dev (localhost, 10.x, 192.168.x, 172.16-31.x, *.local, emulador). */
export function isPrivateUrl(url: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  if (isLoopbackUrl(url) || host.endsWith('.local') || host === '10.0.2.2') return true
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true
  const m = /^172\.(\d+)\./.exec(host)
  return Boolean(m && Number(m[1]) >= 16 && Number(m[1]) <= 31)
}

/** O servidor responde CONFLICT para nome duplicado de vacina/tipo: usa a mensagem específica em pt-BR. */
const DUPLICATE_NAME_CODE: Record<string, string> = {
  vaccines: 'VACCINE_NAME_ALREADY_EXISTS',
  animalTypes: 'ANIMAL_TYPE_NAME_ALREADY_EXISTS',
  herds: 'HERD_NAME_ALREADY_EXISTS',
  shipments: 'SHIPMENT_NAME_ALREADY_EXISTS',
}

export function messageCodeFor(table: string, code: string): string {
  if (code !== 'CONFLICT') return code
  return DUPLICATE_NAME_CODE[entityOfTable(table) ?? ''] ?? code
}

/** Pendência de nome duplicado (para marcar o campo "Nome" ao corrigir). */
export function isDuplicateNameRejection(rejection: { tableName: string; errorCode: string }): boolean {
  const entity = entityOfTable(rejection.tableName) ?? ''
  if (!(entity in DUPLICATE_NAME_CODE)) return false
  return rejection.errorCode === 'CONFLICT' || rejection.errorCode === DUPLICATE_NAME_CODE[entity]
}

export type UploadSummary = { sent: number; applied: number; rejected: RejectionRecord[] }

/**
 * photo_id citados por PUT/PATCH de shipment_animals: essas fotos precisam estar no servidor ANTES do vínculo
 * (ordem obrigatória: foto → vínculo → finalizar; SHIPMENT_FLOW_CONTRACT.uploadOrder).
 */
export function photoIdsOf(ops: UploadOp[]): string[] {
  const photoCol = colOf('shipmentAnimals', 'photoId')
  const ids: string[] = []
  for (const op of ops) {
    if (entityOfTable(op.table) !== 'shipmentAnimals' || op.op === 'DELETE') continue
    const value = op.opData?.[photoCol]
    if (typeof value === 'string' && value) ids.push(value)
  }
  return ids
}

export async function uploadTransaction(
  transaction: TransactionLike,
  deps: {
    post: PostBatch
    saveRejections: (rows: RejectionRecord[]) => Promise<void>
    /** Sobe as fotos (POST /shipments/:id/photos) antes do lote que as cita. Lança Retryable/SessionEnded. */
    ensurePhotos?: (photoIds: string[]) => Promise<unknown>
  },
): Promise<UploadSummary> {
  // PATCH que FICOU vazio depois de remover colunas só do servidor (ex.: shipped_at dos animais ao finalizar) não
  // sobe: nada a aplicar. PATCH que já veio vazio segue como antes (o servidor responde).
  const ops = transaction.crud
    .map((entry) => ({ op: toUploadOp(entry), hadData: Object.keys(entry.opData ?? {}).length > 0 }))
    .filter(({ op, hadData }) => !(hadData && isEmptyPatch(op)))
    .map(({ op }) => op)
  const rejected: RejectionRecord[] = []
  let applied = 0

  for (const batch of chunk(ops)) {
    const photoIds = photoIdsOf(batch)
    if (photoIds.length && deps.ensurePhotos) await deps.ensurePhotos(photoIds)
    let response: PostResponse
    try {
      response = await deps.post({ batch })
    } catch (error) {
      throw new RetryableUploadError(0, `Falha de rede no upload: ${String((error as Error)?.message ?? error)}`)
    }
    if (response.status === 401) {
      throw new SessionEndedUploadError(errorBody(response.data).error ?? 'UNAUTHENTICATED')
    }
    if (isRetryableStatus(response.status)) {
      throw new RetryableUploadError(response.status, `Upload recusado temporariamente (HTTP ${response.status})`)
    }
    if (response.status >= 400) {
      // Lote inteiro recusado: rota/proxy/firewall/configuração ou bug do app — nunca culpa do cadastro. Fica na fila.
      const error = errorBody(response.data)
      const code = error.error && /^[A-Z][A-Z0-9_]+$/.test(error.error) ? error.error : `HTTP_${response.status}`
      console.warn(
        `[sync] upload recusado por inteiro: HTTP ${response.status} ${code} ${error.message ?? ''} (${batch.length} ops ficam na fila)`,
      )
      throw new BatchBlockedUploadError(response.status, code, blockedMessage(response.status, code))
    }
    if (!isJsonObject(response.data)) {
      // 2xx que não é JSON da API (portal cativo do Wi‑Fi, proxy com HTML): nada foi confirmado. Fica na fila.
      throw new RetryableUploadError(0, `Resposta inesperada do servidor (HTTP ${response.status}, sem JSON)`)
    }
    const results = readResults(response.data)
    if (!hasResultsArray(response.data)) {
      // 2xx com JSON sem `results`: o servidor aplicou o lote inteiro (contrato mínimo).
      applied += batch.length
      continue
    }
    for (let index = 0; index < batch.length; index++) {
      const op = batch[index]
      const result =
        results.find((item) => item.id?.toUpperCase() === op.id && item.table === op.table && String(item.op).toUpperCase() === op.op) ??
        // Contrato: um item por op, na mesma ordem (o id pode vir null em op inválida).
        (results.length === batch.length ? results[index] : results[index]?.id?.toUpperCase() === op.id ? results[index] : undefined)
      if (result?.status === 'applied') {
        applied += 1
        continue
      }
      if (result?.status !== 'rejected') {
        // Sem resultado para a op: não confirmada. Reenviar é seguro (PUT = criar ou substituir; DELETE ausente = ok).
        throw new RetryableUploadError(502, 'O servidor não confirmou todas as alterações (sem resultado para uma operação)')
      }
      const status = result.error?.statusCode ?? 422
      if (status === 401) throw new SessionEndedUploadError(result.error?.error ?? 'UNAUTHENTICATED')
      if (isRetryableStatus(status)) {
        // Ex.: SYNC_UNAVAILABLE (503) numa op: falha do servidor, não do cadastro. Lote volta inteiro para a fila.
        throw new RetryableUploadError(status, `Servidor indisponível para uma operação (HTTP ${status} ${result.error?.error ?? ''})`.trim())
      }
      if (status === 404 && op.op === 'DELETE') {
        // Apagar o que o servidor já não tem = objetivo cumprido.
        applied += 1
        continue
      }
      if (!isDefinitiveRejectionStatus(status)) {
        // 403/404/405/410… numa op: referência que o servidor ainda não tem (fazenda/animal criados offline que não
        // chegaram, catálogo de outro ambiente) ou acesso. NÃO é dado inválido: concluir a transação deixaria a linha
        // só na Pendência e o próximo checkpoint do PowerSync a APAGARIA do aparelho. Fica na fila (retry com espera).
        const rejection = rejectionFrom(op, result.error, status)
        console.warn(`[sync] ${op.table} ${op.id}: HTTP ${status} ${rejection.errorCode} — fica na fila (não vira Pendência)`)
        throw new BatchBlockedUploadError(status, rejection.errorCode, dependencyMessage(rejection))
      }
      rejected.push(rejectionFrom(op, result.error, status))
    }
  }

  if (rejected.length) await deps.saveRejections(rejected)
  await transaction.complete()
  return { sent: ops.length, applied, rejected }
}
