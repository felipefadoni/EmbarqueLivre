/**
 * Fotos dos embarques EM ANDAMENTO que só estão no servidor (animal incluído em outro aparelho, reinstalação, troca de
 * usuário): com internet, baixa uma por vez para o aparelho e registra na fila local como `downloaded`, para a lista,
 * o visualizador e o PDF funcionarem sem internet. Nunca sobem (ensurePhotosUploaded ignora).
 * - Continuam guardadas depois de finalizar, como as tiradas no aparelho.
 * - A linha sai quando nenhum vínculo cita mais o photo_id (animal removido, foto trocada, embarque excluído); o
 *   arquivo vira órfão e é apagado na abertura do app.
 * - Sem rede, timeout, 401, 408, 429 ou 5xx: para e tenta no próximo gatilho. Outra recusa (403, 404…): não tenta de
 *   novo enquanto o photo_id estiver em `refused`.
 *
 * Puro (sem React Native): recebe executor SQL e a função de download, para testar no Node.
 */
import { colOf as c, PHOTO_QUEUE_TABLE, tableOf as t } from './mapping'

type Executor = {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<unknown>
}

type MissingPhoto = { photoId: string; linkId: string; shipmentId: string; animalId: string }

export type DownloadPhotosDeps = {
  db: Executor
  /** Arquivo de destino da foto. null = sem o módulo de arquivos (não baixa). */
  targetUri: (photoId: string) => string | null
  /** GET autenticado que só grava em `target` com 2xx. status 0 = sem rede, timeout ou falha ao gravar. */
  download: (shipmentId: string, photoId: string, target: string) => Promise<{ status: number }>
  /** photo_id recusados pelo servidor (quem chama mantém entre execuções). */
  refused: Set<string>
  now: () => string
}

export type DownloadPhotosSummary = { downloaded: number; refused: number; stopped: boolean }

/** Vínculo novo (do sync ou do aparelho) pode citar uma foto que ainda não está aqui. */
export const PHOTO_DOWNLOAD_TRIGGER_TABLES = [t('shipmentAnimals')]

const PQ = PHOTO_QUEUE_TABLE.table
const Q = PHOTO_QUEUE_TABLE.columns
const SA = t('shipmentAnimals')
const PHOTO_ID = c('shipmentAnimals', 'photoId')

const MISSING_SQL = `SELECT sa.${PHOTO_ID} AS photoId, sa.id AS linkId, sa.${c('shipmentAnimals', 'shipmentId')} AS shipmentId,
    sa.${c('shipmentAnimals', 'animalId')} AS animalId
  FROM ${SA} sa
  JOIN ${t('shipments')} s ON s.id = sa.${c('shipmentAnimals', 'shipmentId')}
  LEFT JOIN ${PQ} q ON q.id = sa.${PHOTO_ID}
  WHERE COALESCE(sa.${PHOTO_ID}, '') != '' AND q.id IS NULL
    AND COALESCE(s.${c('shipments', 'status')}, 'in_progress') = 'in_progress'
  ORDER BY sa.${c('shipmentAnimals', 'createdAt')} DESC, sa.id`

const PRUNE_SQL = `DELETE FROM ${PQ} WHERE ${Q.status.name} = 'downloaded'
  AND id NOT IN (SELECT ${PHOTO_ID} FROM ${SA} WHERE ${PHOTO_ID} IS NOT NULL)`

const INSERT_SQL = `INSERT INTO ${PQ} (id, ${Q.shipmentId.name}, ${Q.animalId.name}, ${Q.linkId.name}, ${Q.localUri.name},
    ${Q.status.name}, ${Q.attempts.name}, ${Q.lastError.name}, ${Q.createdAt.name}, ${Q.updatedAt.name})
  VALUES (?, ?, ?, ?, ?, 'downloaded', 0, NULL, ?, ?)`

const retryLater = (status: number) => status === 0 || status === 401 || status === 408 || status === 429 || status >= 500

/** Baixa as fotos que faltam; refaz a busca até não sobrar nenhuma (vínculos podem chegar durante o download). */
export async function downloadServerPhotos(deps: DownloadPhotosDeps): Promise<DownloadPhotosSummary> {
  const summary: DownloadPhotosSummary = { downloaded: 0, refused: 0, stopped: false }
  await deps.db.execute(PRUNE_SQL)
  for (;;) {
    const missing = (await deps.db.getAll<MissingPhoto>(MISSING_SQL)).filter((row) => !deps.refused.has(row.photoId))
    if (!missing.length) return summary
    for (const row of missing) {
      const target = deps.targetUri(row.photoId)
      if (!target) return { ...summary, stopped: true }
      const { status } = await deps.download(row.shipmentId, row.photoId, target)
      if (status >= 200 && status < 300) {
        const now = deps.now()
        await deps.db.execute(INSERT_SQL, [row.photoId, row.shipmentId, row.animalId, row.linkId, target, now, now])
        summary.downloaded += 1
      } else if (retryLater(status)) {
        return { ...summary, stopped: true }
      } else {
        deps.refused.add(row.photoId)
        summary.refused += 1
      }
    }
  }
}
