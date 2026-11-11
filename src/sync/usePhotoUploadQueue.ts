import { useEffect } from 'react'

import { cleanupOrphanPhotos } from '@/features/embarques/photoCapture'
import { db } from './index'
import { referencedPhotoUris } from './photoQueue'

/**
 * As fotos sobem no upload do PowerSync (connector → ensurePhotosUploaded, antes do vínculo). Aqui só a manutenção:
 * ao abrir o app, apaga arquivos de foto que nenhuma linha da fila referencia (vínculo removido, foto trocada).
 */
export function usePhotoUploadQueue() {
  useEffect(() => {
    void (async () => {
      try {
        cleanupOrphanPhotos(await referencedPhotoUris(db))
      } catch (error) {
        console.warn('[fotos] limpeza:', String((error as Error)?.message ?? error))
      }
    })()
  }, [])
}
