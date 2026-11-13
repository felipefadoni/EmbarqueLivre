import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { downloadShipmentPhoto } from '@/api/shipmentPhotos'
import { cleanupOrphanPhotos, serverPhotoUri } from '@/features/embarques/photoCapture'
import { useIsOnline } from './hooks'
import { db } from './index'
import { downloadServerPhotos, PHOTO_DOWNLOAD_TRIGGER_TABLES } from './photoDownload'
import { referencedPhotoUris } from './photoQueue'

/** Recusadas pelo servidor (403, 404…) nesta sessão do app: só tenta de novo ao reabrir. */
const refused = new Set<string>()
let downloading: Promise<void> | null = null

function downloadMissingPhotos() {
  downloading ??= downloadServerPhotos({
    db,
    targetUri: serverPhotoUri,
    download: downloadShipmentPhoto,
    refused,
    now: () => new Date().toISOString(),
  })
    .then(() => undefined)
    .catch((error) => console.warn('[fotos] download:', String((error as Error)?.message ?? error)))
    .finally(() => {
      downloading = null
    })
  return downloading
}

/**
 * As fotos sobem no upload do PowerSync (connector → ensurePhotosUploaded, antes do vínculo). Aqui a manutenção:
 * - ao abrir o app, apaga arquivos de foto que nenhuma linha da fila referencia (vínculo removido, foto trocada);
 * - depois, com internet, baixa as fotos dos embarques em andamento que só estão no servidor (photoDownload.ts): na
 *   abertura, quando muda um vínculo (sync ou aparelho), quando a rede volta e quando o app volta ao primeiro plano.
 */
export function usePhotoUploadQueue() {
  const online = useIsOnline()
  const [cleaned, setCleaned] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        // O download grava o arquivo antes da linha da fila: limpar no meio apagaria a foto recém-baixada.
        await downloading
        cleanupOrphanPhotos(await referencedPhotoUris(db))
      } catch (error) {
        console.warn('[fotos] limpeza:', String((error as Error)?.message ?? error))
      } finally {
        setCleaned(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!cleaned || !online) return
    void downloadMissingPhotos()
    const offChange = db.onChange({ onChange: () => void downloadMissingPhotos() }, { tables: PHOTO_DOWNLOAD_TRIGGER_TABLES, throttleMs: 2_000 })
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void downloadMissingPhotos()
    })
    return () => {
      offChange()
      subscription.remove()
    }
  }, [cleaned, online])
}
