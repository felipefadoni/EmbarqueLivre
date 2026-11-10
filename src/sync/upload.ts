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
 * - 401, 408, 429, 5xx ou sem rede: lança RetryableUploadError para o PowerSync tentar de novo
 *   (nada é concluído; reenvio precisa ser idempotente no servidor).
 * - Outros 4xx no lote inteiro (400/403/404/409/422): todas as ops do lote viram pendências.
 *
 * Puro (sem React Native) para testar com servidor simulado.
 */
import { publicApiMessage } from '../api/errors'
import { entityOfTable, UPLOAD_BATCH_LIMIT, colOf } from './mapping'

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

export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500
}

/** Ajustes do contrato: PATCH de fazenda nunca leva owner_user_id. IDs em maiúsculas. */
export function toUploadOp(entry: CrudLike): UploadOp {
  const op = String(entry.op).toUpperCase() as UploadOpType
  let opData = entry.opData ? { ...entry.opData } : undefined
  if (op === 'PATCH' && opData && entityOfTable(entry.table) === 'farms') {
    delete opData[colOf('farms', 'ownerUserId')]
  }
  if (op === 'DELETE') opData = undefined
  return { op, table: entry.table, id: String(entry.id).toUpperCase(), ...(opData ? { opData } : {}) }
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
  const code = error?.error && /^[A-Z][A-Z0-9_]+$/.test(error.error) ? error.error : status === 409 ? 'CONFLICT' : status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'
  const message = publicApiMessage({ status, code: messageCodeFor(op.table, code), message: error?.message })
  return {
    entity: entityOfTable(op.table) ?? op.table,
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
export function resolvePowerSyncEndpoint(envUrl: string | undefined | null, tokenUrl: string | undefined | null): string {
  return (envUrl || '').trim() || (tokenUrl || '').trim()
}

/** O servidor responde CONFLICT para nome duplicado de vacina/tipo: usa a mensagem específica em pt-BR. */
const DUPLICATE_NAME_CODE: Record<string, string> = {
  vaccines: 'VACCINE_NAME_ALREADY_EXISTS',
  animalTypes: 'ANIMAL_TYPE_NAME_ALREADY_EXISTS',
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

export async function uploadTransaction(
  transaction: TransactionLike,
  deps: { post: PostBatch; saveRejections: (rows: RejectionRecord[]) => Promise<void> },
): Promise<UploadSummary> {
  const ops = transaction.crud.map(toUploadOp)
  const rejected: RejectionRecord[] = []
  let applied = 0

  for (const batch of chunk(ops)) {
    let response: PostResponse
    try {
      response = await deps.post({ batch })
    } catch (error) {
      throw new RetryableUploadError(0, `Falha de rede no upload: ${String((error as Error)?.message ?? error)}`)
    }
    if (isRetryableStatus(response.status)) {
      throw new RetryableUploadError(response.status, `Upload recusado temporariamente (HTTP ${response.status})`)
    }
    if (response.status >= 400) {
      // Lote inteiro recusado (ex.: 400 INVALID_BATCH / BATCH_TOO_LARGE = bug do app). Reenviar não adianta:
      // registra no log e move as ops para Pendências, para a fila não travar.
      const error = errorBody(response.data)
      console.warn(`[sync] upload recusado por inteiro: HTTP ${response.status} ${error.error ?? ''} (${batch.length} ops)`)
      for (const op of batch) rejected.push(rejectionFrom(op, error, response.status))
      continue
    }
    const results = readResults(response.data)
    if (!hasResultsArray(response.data)) {
      // 2xx sem `results`: o servidor aplicou o lote inteiro (contrato mínimo).
      applied += batch.length
      continue
    }
    batch.forEach((op, index) => {
      const result =
        results.find((item) => item.id?.toUpperCase() === op.id && item.table === op.table && String(item.op).toUpperCase() === op.op) ??
        // Contrato: um item por op, na mesma ordem (o id pode vir null em op inválida).
        (results.length === batch.length ? results[index] : results[index]?.id?.toUpperCase() === op.id ? results[index] : undefined)
      if (result?.status === 'applied') {
        applied += 1
      } else if (result?.status === 'rejected') {
        rejected.push(rejectionFrom(op, result.error, result.error?.statusCode ?? 422))
      } else {
        rejected.push(
          rejectionFrom(op, { statusCode: 502, error: 'SYNC_NO_RESULT', message: 'O servidor não confirmou esta alteração.' }, 502),
        )
      }
    })
  }

  if (rejected.length) await deps.saveRejections(rejected)
  await transaction.complete()
  return { sent: ops.length, applied, rejected }
}
