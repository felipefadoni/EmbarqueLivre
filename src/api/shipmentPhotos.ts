/**
 * Foto do animal no embarque (contrato final, SHIPMENT_FLOW_CONTRACT.photo).
 * - Upload: POST multipart autenticado em /shipments/:id/photos (arquivo `photo` image/jpeg + `id` = photo_id gerado no
 *   app; repetir o mesmo id devolve a mesma foto, então o reenvio é seguro). Separado do /powersync/upload (sem base64).
 * - Exibição: GET autenticado /shipments/:id/photos/:photoId (expo-image com o cabeçalho Authorization). O mesmo GET
 *   guarda no aparelho as fotos dos embarques em andamento, para uso offline (src/sync/photoDownload.ts).
 * expo-file-system é carregado sob demanda: um dev build antigo (sem o módulo nativo) não quebra ao abrir o app.
 */
import { fetch } from 'expo/fetch'

import { SHIPMENT_FLOW_CONTRACT } from './shipmentsContract'
import { API_BASE_URL, authorizationHeader, refreshAccessToken } from './client'
import type { PhotoQueueRow, PhotoUploadResponse } from '../sync/photoQueue'

type FileSystemModule = typeof import('expo-file-system')

export function loadFileSystem(): FileSystemModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system') as FileSystemModule
  } catch {
    return null
  }
}

export function shipmentPhotoUrl(shipmentId: string, photoId: string): string {
  return `${API_BASE_URL}${SHIPMENT_FLOW_CONTRACT.photo.downloadPath(shipmentId, photoId)}`
}

export function shipmentPhotoUploadUrl(shipmentId: string): string {
  return `${API_BASE_URL}${SHIPMENT_FLOW_CONTRACT.photo.uploadPath(shipmentId)}`
}

function parseBody(body: string | undefined): unknown {
  if (!body) return undefined
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

/** Envia a foto da fila. status 0 = sem rede / módulo nativo ausente (fica pendente). */
export async function uploadShipmentPhoto(row: PhotoQueueRow): Promise<PhotoUploadResponse> {
  const fs = loadFileSystem()
  if (!fs) return { status: 0 }
  const send = async () => {
    const file = new fs.File(row.localUri)
    const result = await file.upload(shipmentPhotoUploadUrl(row.shipmentId), {
      httpMethod: 'POST',
      uploadType: fs.UploadType.MULTIPART,
      fieldName: SHIPMENT_FLOW_CONTRACT.photo.fieldName,
      mimeType: SHIPMENT_FLOW_CONTRACT.photo.mimeType,
      parameters: { [SHIPMENT_FLOW_CONTRACT.photo.idField]: row.id },
      headers: await authorizationHeader(),
      // iOS: URLSession de segundo plano — o envio continua com o app suspenso (não se o app for encerrado à força).
      sessionType: 'background',
    })
    return { status: result.status, body: parseBody(result.body) }
  }
  let response = await withTimeout(send(), PHOTO_UPLOAD_TIMEOUT_MS)
  if (response.status === 401 && (await refreshAccessToken())) response = await withTimeout(send(), PHOTO_UPLOAD_TIMEOUT_MS)
  return response
}

/**
 * Teto de espera do envio da foto. Sem isso um upload que nunca responde segurava a fila inteira (o connector envia um
 * por vez) sem nenhum aviso. Estourou = status 0 (fica pendente; reenviar com o mesmo photo_id é seguro).
 */
export const PHOTO_UPLOAD_TIMEOUT_MS = 120_000

function withTimeout(promise: Promise<PhotoUploadResponse>, ms: number): Promise<PhotoUploadResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<PhotoUploadResponse>((resolve) => {
    timer = setTimeout(() => resolve({ status: 0 }), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function localFileExists(uri: string): boolean {
  const fs = loadFileSystem()
  if (!fs) return true
  try {
    return new fs.File(uri).exists
  } catch {
    return false
  }
}

/** Teto de espera do download de uma foto (estourou = status 0: tenta no próximo gatilho). */
const PHOTO_DOWNLOAD_TIMEOUT_MS = 60_000

/** Baixa a foto do servidor para `target` (só grava com 2xx). status 0 = sem rede, timeout, falha ao gravar ou sem o módulo. */
export async function downloadShipmentPhoto(shipmentId: string, photoId: string, target: string): Promise<{ status: number }> {
  const fs = loadFileSystem()
  if (!fs) return { status: 0 }
  const get = async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PHOTO_DOWNLOAD_TIMEOUT_MS)
    try {
      const response = await fetch(shipmentPhotoUrl(shipmentId, photoId), { headers: await authorizationHeader(), signal: controller.signal })
      if (response.ok) await new fs.File(target).write(await response.bytes())
      return { status: response.status }
    } catch {
      return { status: 0 }
    } finally {
      clearTimeout(timer)
    }
  }
  let result = await get()
  if (result.status === 401 && (await refreshAccessToken())) result = await get()
  return result
}
