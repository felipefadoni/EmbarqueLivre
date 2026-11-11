import NetInfo from '@react-native-community/netinfo'
import { useSyncExternalStore } from 'react'

import { API_BASE_URL } from '@/api/client'
import { localFileExists, uploadShipmentPhoto } from '@/api/shipmentPhotos'
import { drainUploadQueue } from './backgroundDrain'
import { connector, db } from './index'
import { REJECTIONS_TABLE, PHOTO_QUEUE_TABLE } from './mapping'
import { nextUploadKey, OUTBOX_COUNT_SQL } from './outbox'
import { ensurePhotosUploaded, retryPhoto } from './photoQueue'
import { createUploadPump, describeUploadProblem } from './uploadPump'
import { isOnline } from './syncTriggers'

/** Janela de um envio em primeiro plano (o resto continua no próximo). */
const FOREGROUND_BUDGET_MS = 60_000

/** "192.168.1.77:3000" / "api.exemplo.com": mostrado na falha para saber se o app aponta para a VPS ou para a API local. */
export const API_LABEL = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

async function outboxCount(): Promise<number> {
  const row = await db.getOptional<{ n: number }>(OUTBOX_COUNT_SQL).catch(() => null)
  return Number(row?.n ?? 0)
}

async function online(): Promise<boolean> {
  return isOnline(await NetInfo.fetch().catch(() => null))
}

/** Envio direto da fila para a API (ver uploadPump.ts). Uma instância para o app inteiro. */
export const uploadPump = createUploadPump({
  // Fila do PowerSync + saída de reenvio (ops que já saíram do ps_crud e ainda não chegaram).
  pendingCount: async () => (await db.getUploadQueueStats()).count + (await outboxCount()),
  drain: () =>
    drainUploadQueue({
      nextTransactionId: () => nextUploadKey(db),
      upload: () => connector.uploadData(db),
      now: Date.now,
      deadline: Date.now() + FOREGROUND_BUDGET_MS,
    }),
  lastError: () => connector.lastError,
  isOnline: online,
  isSdkConnected: async () => db.currentStatus.connected && (await outboxCount()) === 0,
  apiLabel: API_LABEL,
  log: (message) => console.log(message),
})

export function useUploadPump() {
  const state = useSyncExternalStore(uploadPump.subscribe, uploadPump.getState, uploadPump.getState)
  return { ...state, sendNow: uploadPump.sendNow }
}

/** Erro do SDK (dataFlowStatus.uploadError) no mesmo texto pt-BR do envio direto. */
export function describeSdkUploadError(error: unknown) {
  return error ? describeUploadProblem(error, API_LABEL, Date.now()) : null
}

export type ResendPhotoResult = { ok: boolean; message: string }

/**
 * "Reenviar foto": antes só voltava a foto para "pendente" e nada a enviava se o vínculo já tinha saído da fila
 * (a foto só sobe junto do lote que a cita). Agora:
 * - vínculo ainda na fila → envia a fila já (a foto sobe antes do vínculo, na ordem de sempre);
 * - vínculo já processado → envia a foto agora (POST /shipments/:id/photos, mesmo photo_id = idempotente).
 * Sempre devolve uma mensagem pt-BR para a tela.
 */
export async function resendPhoto(photoId: string, linkId: string): Promise<ResendPhotoResult> {
  await retryPhoto(db, photoId, new Date().toISOString())
  const queued = await db
    .getOptional<{ one: number }>(`SELECT 1 AS one FROM ps_crud WHERE upper(json_extract(data, '$.id')) = upper(?) LIMIT 1`, [linkId])
    .then(Boolean)
    .catch(() => false)
  if (queued) {
    const result = await uploadPump.sendNow()
    return { ok: result.outcome === 'sent' || result.outcome === 'partial' || result.outcome === 'empty', message: result.message }
  }
  if (!(await online())) {
    return { ok: false, message: 'Sem internet. A foto fica guardada; toque em “Reenviar foto” quando a rede voltar.' }
  }
  try {
    const summary = await ensurePhotosUploaded([photoId], {
      db,
      upload: uploadShipmentPhoto,
      fileExists: localFileExists,
      now: () => new Date().toISOString(),
    })
    if (summary.uploaded || summary.skipped) {
      const R = REJECTIONS_TABLE.columns
      const rejected = await db
        .getOptional(`SELECT id FROM ${REJECTIONS_TABLE.table} WHERE upper(${R.rowId.name}) = upper(?) LIMIT 1`, [linkId])
        .catch(() => null)
      return {
        ok: true,
        message: rejected
          ? 'Foto enviada. O animal ainda está em Pendências: abra Pendências e toque em “Corrigir” para reenviá-lo.'
          : 'Foto enviada.',
      }
    }
    const Q = PHOTO_QUEUE_TABLE.columns
    const row = await db
      .getOptional<{ lastError: string | null }>(`SELECT ${Q.lastError.name} AS lastError FROM ${PHOTO_QUEUE_TABLE.table} WHERE id = ?`, [photoId])
      .catch(() => null)
    return { ok: false, message: `A foto não foi aceita pelo servidor: ${row?.lastError ?? 'motivo desconhecido'}. Tire outra foto em “Ajustar peso/foto”.` }
  } catch (error) {
    return { ok: false, message: describeUploadProblem(error, API_LABEL, Date.now()).message }
  }
}
