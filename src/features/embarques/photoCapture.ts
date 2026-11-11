/**
 * Foto do animal no embarque: câmera (galeria só como alternativa explícita), compressão no aparelho
 * (maior lado até 1280 px, JPEG 0,7) e arquivo guardado no diretório de documentos do app.
 * Módulos nativos carregados sob demanda: sem eles (dev build antigo) a tela explica em vez de quebrar.
 */
import { Linking } from 'react-native'

import { fitWithin, SHIPMENT_FLOW_CONTRACT } from '@/api/shipmentsContract'
import { loadFileSystem } from '@/api/shipmentPhotos'
import { newUlid } from '@/sync/ids'

export type PhotoResult =
  | { kind: 'ok'; uri: string }
  | { kind: 'canceled' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'unavailable'; message: string }

const PHOTO_DIR = 'shipment-photos'
const MISSING_NATIVE =
  'A câmera ainda não está disponível neste app. Atualize o app de desenvolvimento (npx expo run:ios / run:android) e tente de novo.'

type PickerModule = typeof import('expo-image-picker')
type ManipulatorModule = typeof import('expo-image-manipulator')

function loadPicker(): PickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-picker') as PickerModule
  } catch {
    return null
  }
}

function loadManipulator(): ManipulatorModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator') as ManipulatorModule
  } catch {
    return null
  }
}

/** Abre a câmera (pede a permissão). A foto já volta comprimida e guardada no aparelho. */
export async function takeShipmentPhoto(): Promise<PhotoResult> {
  const picker = loadPicker()
  if (!picker) return { kind: 'unavailable', message: MISSING_NATIVE }
  try {
    const permission = await picker.requestCameraPermissionsAsync()
    if (!permission.granted) return { kind: 'denied', canAskAgain: permission.canAskAgain }
    const result = await picker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false })
    if (result.canceled || !result.assets?.length) return { kind: 'canceled' }
    const asset = result.assets[0]
    return { kind: 'ok', uri: await compressAndStore(asset.uri, asset.width, asset.height) }
  } catch (error) {
    return { kind: 'unavailable', message: `Não foi possível usar a câmera. ${String((error as Error)?.message ?? '')}`.trim() }
  }
}

/** Alternativa explícita quando a câmera não pode ser usada: escolher uma foto da galeria. */
export async function pickShipmentPhotoFromLibrary(): Promise<PhotoResult> {
  const picker = loadPicker()
  if (!picker) return { kind: 'unavailable', message: MISSING_NATIVE }
  try {
    const result = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false, selectionLimit: 1 })
    if (result.canceled || !result.assets?.length) return { kind: 'canceled' }
    const asset = result.assets[0]
    return { kind: 'ok', uri: await compressAndStore(asset.uri, asset.width, asset.height) }
  } catch (error) {
    return { kind: 'unavailable', message: `Não foi possível abrir a galeria. ${String((error as Error)?.message ?? '')}`.trim() }
  }
}

/** Comprime (maior lado <= 1280 px, JPEG 0,7) e move para documents/shipment-photos/<ULID>.jpg. */
export async function compressAndStore(uri: string, width: number, height: number): Promise<string> {
  const manipulator = loadManipulator()
  const fs = loadFileSystem()
  if (!manipulator || !fs) throw new Error(MISSING_NATIVE)
  const context = manipulator.ImageManipulator.manipulate(uri)
  const size = fitWithin(width, height, SHIPMENT_FLOW_CONTRACT.photo.maxSidePx)
  if (size) context.resize(size)
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ compress: SHIPMENT_FLOW_CONTRACT.photo.jpegQuality, format: manipulator.SaveFormat.JPEG })
  const dir = new fs.Directory(fs.Paths.document, PHOTO_DIR)
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
  const target = new fs.File(dir, `${newUlid()}.jpg`)
  new fs.File(saved.uri).move(target)
  return target.uri
}

/** Apaga uma foto local (ex.: o usuário desistiu antes de salvar). */
export function deleteLocalPhoto(uri: string | null | undefined) {
  const fs = loadFileSystem()
  if (!fs || !uri) return
  try {
    const file = new fs.File(uri)
    if (file.exists) file.delete()
  } catch {
    // arquivo já removido
  }
}

/** Remove arquivos da pasta de fotos que não estão mais na fila (vínculo removido, embarque excluído). */
export function cleanupOrphanPhotos(referenced: Set<string>) {
  const fs = loadFileSystem()
  if (!fs) return
  try {
    const dir = new fs.Directory(fs.Paths.document, PHOTO_DIR)
    if (!dir.exists) return
    for (const entry of dir.list()) {
      if (entry instanceof fs.File && !referenced.has(entry.uri)) entry.delete()
    }
  } catch {
    // limpeza é melhor esforço
  }
}

/** Abre os Ajustes do app para liberar a câmera. */
export function openAppSettings() {
  void Linking.openSettings()
}
