/**
 * Fila local das fotos dos animais do embarque (tabela local-only `shipment_photo_queue`, contrato final).
 *
 * - A foto (JPEG comprimido) fica no filesystem do aparelho; a fila guarda o caminho e o estado. id = photo_id (ULID
 *   gerado no app), o mesmo gravado em shipment_animals.photo_id.
 * - Entra na MESMA writeTransaction do vínculo (repository.addShipmentAnimal / updateShipmentAnimal).
 * - Ordem obrigatória no upload (connector): 1) POST /shipments/:id/photos (multipart `photo` + `id`) → 2) PUT/PATCH do
 *   vínculo com photo_id e weight_kg → 3) PATCH do embarque { status: "finished" }. O binário nunca vai no PowerSync.
 *   `ensurePhotosUploaded` roda antes de cada lote que cita um photo_id: o embarque já subiu (transação anterior).
 * - 2xx → uploaded. Sem rede, 408, 429, 5xx → RetryableUploadError (o SDK tenta o lote de novo depois). 401 →
 *   SessionEndedUploadError. Outros 4xx (INVALID_SHIPMENT_PHOTO, 413, SHIPMENT_NOT_FOUND…) → failed com a mensagem do
 *   servidor; o vínculo segue e o servidor o recusa (vira pendência), para a fila não travar.
 *
 * Puro (sem React Native): recebe executor SQL e a função de upload, para testar no Node.
 */
import { publicApiMessage } from '../api/errors'
import { PHOTO_QUEUE_TABLE } from './mapping'
import { RetryableUploadError, SessionEndedUploadError } from './upload'

export type PhotoQueueStatus = 'pending' | 'uploaded' | 'failed'

export type PhotoQueueRow = {
  id: string
  shipmentId: string
  animalId: string
  linkId: string | null
  localUri: string
  status: PhotoQueueStatus
  attempts: number
  lastError: string | null
}

export type PhotoUploadResponse = { status: number; body?: unknown }

type Executor = {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<unknown>
}

export type EnsurePhotosDeps = {
  db: Executor
  /** POST multipart da foto. Deve lançar (ou responder status 0) sem rede. */
  upload: (row: PhotoQueueRow) => Promise<PhotoUploadResponse>
  /** O arquivo local ainda existe? */
  fileExists?: (uri: string) => boolean
  now: () => string
}

export type EnsurePhotosSummary = { uploaded: number; failed: number; skipped: number }

const T = PHOTO_QUEUE_TABLE.table
const C = PHOTO_QUEUE_TABLE.columns

const SELECT_ROW = `SELECT id, ${C.shipmentId.name} AS shipmentId, ${C.animalId.name} AS animalId, ${C.linkId.name} AS linkId,
  ${C.localUri.name} AS localUri, ${C.status.name} AS status, COALESCE(${C.attempts.name}, 0) AS attempts,
  ${C.lastError.name} AS lastError FROM ${T}`

export function pendingPhotosQuery() {
  return { sql: `${SELECT_ROW} WHERE ${C.status.name} = 'pending' ORDER BY ${C.createdAt.name}, id`, params: [] as unknown[] }
}

function bodyOf(response: PhotoUploadResponse): Record<string, unknown> {
  return response.body && typeof response.body === 'object' ? (response.body as Record<string, unknown>) : {}
}

/** Mensagem da resposta (JSON da API, prioridade) ou texto padrão. 413 = foto acima de 10 MB. */
function responseMessage(response: PhotoUploadResponse): string {
  const body = bodyOf(response)
  const code = typeof body.error === 'string' ? body.error : response.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'PHOTO_UPLOAD_FAILED'
  const message = typeof body.message === 'string' ? body.message : undefined
  return publicApiMessage({ status: response.status, code, message })
}

/**
 * Sobe (antes do vínculo) as fotos citadas pelos photo_id do lote. Ignora ids sem linha na fila (foto de outro
 * aparelho, já no servidor) e as já enviadas.
 */
export async function ensurePhotosUploaded(photoIds: string[], deps: EnsurePhotosDeps): Promise<EnsurePhotosSummary> {
  const summary: EnsurePhotosSummary = { uploaded: 0, failed: 0, skipped: 0 }
  const ids = [...new Set(photoIds.filter(Boolean))]
  if (!ids.length) return summary
  const rows = await deps.db.getAll<PhotoQueueRow>(
    `${SELECT_ROW} WHERE upper(id) IN (${ids.map(() => '?').join(', ')}) ORDER BY ${C.createdAt.name}, id`,
    ids.map((id) => id.toUpperCase()),
  )
  for (const row of rows) {
    if (row.status === 'uploaded') {
      summary.skipped += 1
      continue
    }
    if (deps.fileExists && !deps.fileExists(row.localUri)) {
      await mark(deps, row, 'failed', 'A foto não está mais no aparelho. Tire outra foto do animal.')
      summary.failed += 1
      continue
    }
    let response: PhotoUploadResponse
    try {
      response = await deps.upload(row)
    } catch {
      response = { status: 0 }
    }
    if (response.status >= 200 && response.status < 300) {
      await mark(deps, row, 'uploaded', null)
      summary.uploaded += 1
      continue
    }
    if (response.status === 0 || response.status === 408 || response.status === 429 || response.status >= 500) {
      await mark(deps, row, 'pending', 'Sem conexão com o servidor. A foto será enviada depois.')
      throw new RetryableUploadError(response.status, `Envio da foto adiado (HTTP ${response.status})`)
    }
    if (response.status === 401) {
      throw new SessionEndedUploadError(typeof bodyOf(response).error === 'string' ? String(bodyOf(response).error) : 'UNAUTHENTICATED')
    }
    await mark(deps, row, 'failed', responseMessage(response))
    summary.failed += 1
  }
  return summary
}

async function mark(deps: EnsurePhotosDeps, row: PhotoQueueRow, status: PhotoQueueStatus, lastError: string | null) {
  await deps.db.execute(
    `UPDATE ${T} SET ${C.status.name} = ?, ${C.attempts.name} = COALESCE(${C.attempts.name}, 0) + 1, ${C.lastError.name} = ?, ${C.updatedAt.name} = ? WHERE id = ?`,
    [status, lastError, deps.now(), row.id],
  )
}

/** Volta uma foto recusada para a fila (o próximo upload do vínculo tenta de novo). */
export async function retryPhoto(db: Executor, photoId: string, now: string) {
  await db.execute(`UPDATE ${T} SET ${C.status.name} = 'pending', ${C.lastError.name} = NULL, ${C.updatedAt.name} = ? WHERE id = ?`, [now, photoId])
}

/** Caminhos de foto ainda referenciados (para limpar arquivos órfãos). */
export async function referencedPhotoUris(db: Executor): Promise<Set<string>> {
  const rows = await db.getAll<{ uri: string }>(`SELECT ${C.localUri.name} AS uri FROM ${T}`)
  return new Set(rows.map((row) => row.uri).filter(Boolean))
}

export const PHOTO_STATUS_LABEL: Record<PhotoQueueStatus, string> = {
  pending: 'Foto aguardando envio',
  uploaded: 'Foto enviada',
  failed: 'Foto não enviada',
}
