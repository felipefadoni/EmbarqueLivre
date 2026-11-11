/**
 * "Exportar Dados": monta o PDF do embarque finalizado (expo-print) e abre o share sheet nativo (expo-sharing).
 * Dados do SQLite local (mesmos do detalhe). Fotos: arquivo local da fila; senão GET autenticado
 * /shipments/:id/photos/:photoId. Foto que falhar vira placeholder na célula (o PDF sai mesmo assim).
 * Módulos nativos carregados sob demanda: build antigo sem expo-print/expo-sharing mostra mensagem, não quebra.
 */
import { authorizationHeader } from '@/api/client'
import type { ApiError, UserRole } from '@/api/types'
import { loadFileSystem, shipmentPhotoUrl } from '@/api/shipmentPhotos'
import { canExportShipments } from '@/features/cadastros/permissions'
import { db } from '@/sync'
import { rowToShipment, shipmentByIdQuery, shipmentReportAnimalsQuery, type ShipmentReportAnimalRow, type ShipmentRow } from '@/sync/queries'
import { buildShipmentReportHtml, reportFileName, type ShipmentReportAnimal } from './shipmentReport'

type PrintModule = typeof import('expo-print')
type SharingModule = typeof import('expo-sharing')
type ManipulatorModule = typeof import('expo-image-manipulator')

/** Lado maior da foto no PDF (célula ~92 pt; 320 px fica nítido impresso e o arquivo continua leve). */
const REPORT_PHOTO_PX = 320
const PHOTO_CONCURRENCY = 4
const MISSING_NATIVE = 'Para exportar, atualize o app (instale o build novo do Embarque Livre) e tente de novo.'

function optional<T>(load: () => T): T | null {
  try {
    return load()
  } catch {
    return null
  }
}

function exportError(status: number, code: string, message: string): ApiError {
  return { status, code, message } as ApiError
}

export type ExportResult = { fileName: string; animals: number; photosMissing: number; shared: boolean }

async function toDataUri(manipulator: ManipulatorModule, uri: string): Promise<string | null> {
  const context = manipulator.ImageManipulator.manipulate(uri)
  context.resize({ width: REPORT_PHOTO_PX })
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ compress: 0.7, format: manipulator.SaveFormat.JPEG, base64: true })
  return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null
}

/** Foto do animal como data URI (null = indisponível → placeholder). Nunca lança. */
async function resolvePhoto(shipmentId: string, row: ShipmentReportAnimalRow, headers: Record<string, string>): Promise<string | null> {
  const fs = loadFileSystem()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const manipulator = optional(() => require('expo-image-manipulator') as ManipulatorModule)
  if (!fs || !manipulator) return null
  try {
    if (row.localPhotoUri && new fs.File(row.localPhotoUri).exists) return await toDataUri(manipulator, row.localPhotoUri)
  } catch {
    // arquivo local ilegível: tenta o servidor
  }
  if (!row.photoId) return null
  const temp = new fs.File(fs.Paths.cache, `relatorio-foto-${row.photoId}.jpg`)
  try {
    const file = await fs.File.downloadFileAsync(shipmentPhotoUrl(shipmentId, row.photoId), temp, { headers, idempotent: true })
    return await toDataUri(manipulator, file.uri)
  } catch {
    return null
  } finally {
    try {
      if (temp.exists) temp.delete()
    } catch {
      // limpeza é melhor esforço
    }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      out[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Gera e compartilha o PDF. Recusa: basic/sem sessão → 403 INSUFFICIENT_ROLE; embarque não finalizado → 422.
 */
export async function exportShipmentReport(shipmentId: string, role: UserRole | null | undefined): Promise<ExportResult> {
  if (!canExportShipments(role)) {
    throw exportError(403, 'INSUFFICIENT_ROLE', 'Você não tem permissão para executar esta ação')
  }
  const row = await db.getOptional<ShipmentRow>(shipmentByIdQuery(shipmentId).sql, shipmentByIdQuery(shipmentId).params)
  if (!row) throw exportError(404, 'SHIPMENT_NOT_FOUND', 'Embarque não encontrado neste aparelho.')
  const shipment = rowToShipment(row)
  if (shipment.status !== 'finished') {
    throw exportError(422, 'SHIPMENT_NOT_FINISHED', 'Só é possível exportar os dados de um embarque finalizado.')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const print = optional(() => require('expo-print') as PrintModule)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharing = optional(() => require('expo-sharing') as SharingModule)
  const fs = loadFileSystem()
  if (!print || !sharing || !fs) throw exportError(0, 'EXPORT_UNAVAILABLE', MISSING_NATIVE)

  const query = shipmentReportAnimalsQuery(shipmentId)
  const rows = await db.getAll<ShipmentReportAnimalRow>(query.sql, query.params)
  const headers = await authorizationHeader().catch(() => ({}) as Record<string, string>)
  const photos = await mapLimit(rows, PHOTO_CONCURRENCY, (r) => resolvePhoto(shipmentId, r, headers))
  const animals: ShipmentReportAnimal[] = rows.map((r, i) => ({
    code: r.code,
    weightKg: r.weightKg == null ? null : Number(r.weightKg),
    herdName: r.herdName,
    photoDataUri: photos[i],
  }))

  const html = buildShipmentReportHtml({
    shipmentName: shipment.name,
    farmName: shipment.farmName ?? null,
    shippedOn: shipment.shippedOn ?? null,
    animals,
    generatedAt: new Date(),
  })
  const printed = await print.printToFileAsync({ html, width: 595, height: 842 })
  const fileName = reportFileName(shipment.name, shipment.shippedOn)
  const target = new fs.File(fs.Paths.cache, fileName)
  if (target.exists) target.delete()
  new fs.File(printed.uri).move(target)

  if (!(await sharing.isAvailableAsync())) {
    throw exportError(0, 'SHARE_UNAVAILABLE', 'O compartilhamento não está disponível neste aparelho.')
  }
  await sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Exportar dados do embarque' })
  return { fileName, animals: animals.length, photosMissing: photos.filter((p) => !p).length, shared: true }
}
