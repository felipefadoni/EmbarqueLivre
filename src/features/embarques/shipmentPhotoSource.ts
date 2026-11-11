/**
 * Fonte da foto do animal no embarque (miniatura e visualização em tela cheia):
 * arquivo local da fila (funciona offline) ou GET autenticado /shipments/:id/photos/:photoId.
 */
import { useCallback, useEffect, useState } from 'react'

import { authorizationHeader } from '@/api/client'
import { shipmentPhotoUrl } from '@/api/shipmentPhotos'

export type ShipmentPhotoRef = {
  shipmentId: string
  /** Arquivo local (fila de upload): preferido. */
  localUri?: string | null
  /** photo_id do vínculo: sem arquivo local, GET autenticado. */
  photoId?: string | null
}

export type ShipmentPhotoSource = { uri: string; headers?: Record<string, string>; cacheKey?: string }

/** Há foto para mostrar (local ou no servidor)? Vínculo antigo sem foto = false. */
export function hasShipmentPhoto(ref: ShipmentPhotoRef): boolean {
  return Boolean(ref.localUri) || Boolean(ref.photoId)
}

/** Fonte da imagem a partir do cabeçalho de autorização já obtido (null = ainda sem cabeçalho ou sem foto). */
export function buildShipmentPhotoSource(ref: ShipmentPhotoRef, headers: Record<string, string> | null): ShipmentPhotoSource | null {
  if (ref.localUri) return { uri: ref.localUri }
  if (!ref.photoId || !headers) return null
  return { uri: shipmentPhotoUrl(ref.shipmentId, ref.photoId), headers, cacheKey: `shipment-photo-${ref.photoId}` }
}

/**
 * Fonte pronta para o expo-image. `reload()` busca de novo o cabeçalho (token renovado) — usado no "Tentar de novo".
 * `enabled = false` não busca nada (ex.: visualizador fechado).
 */
export function useShipmentPhotoSource(ref: ShipmentPhotoRef, enabled = true) {
  const remote = enabled && !ref.localUri && Boolean(ref.photoId)
  const [headers, setHeaders] = useState<Record<string, string> | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!remote) return
    let alive = true
    authorizationHeader()
      .then((value) => {
        if (alive) setHeaders(value)
      })
      .catch(() => {
        if (alive) setHeaders({})
      })
    return () => {
      alive = false
    }
  }, [remote, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { source: enabled ? buildShipmentPhotoSource(ref, headers) : null, attempt, reload }
}
