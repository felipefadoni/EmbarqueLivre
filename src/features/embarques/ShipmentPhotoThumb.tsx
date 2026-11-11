import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import { YStack } from 'tamagui'

import { authorizationHeader } from '@/api/client'
import { shipmentPhotoUrl } from '@/api/shipmentPhotos'

type Props = {
  shipmentId: string
  /** Arquivo local (fila de upload): preferido, funciona offline. */
  localUri?: string | null
  /** photo_id do vínculo: sem arquivo local, GET autenticado /shipments/:id/photos/:photoId. */
  photoId?: string | null
  size?: number
}

/** Miniatura da foto do animal no embarque: arquivo local; senão GET autenticado; senão um ícone. */
export function ShipmentPhotoThumb({ shipmentId, localUri, photoId, size = 64 }: Props) {
  const isDark = useColorScheme() === 'dark'
  const remote = !localUri && Boolean(photoId)
  const [headers, setHeaders] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    if (!remote) return
    let alive = true
    void authorizationHeader().then((value) => {
      if (alive) setHeaders(value)
    })
    return () => {
      alive = false
    }
  }, [remote])

  const source = localUri
    ? { uri: localUri }
    : remote && headers
      ? { uri: shipmentPhotoUrl(shipmentId, photoId as string), headers, cacheKey: `shipment-photo-${photoId}` }
      : null

  return (
    <YStack style={{ width: size, height: size }} rounded={12} overflow="hidden" bg="brandSurface" items="center" justify="center" borderWidth={1} borderColor="brandBorder">
      {source ? (
        <Image source={source} style={{ width: size, height: size }} contentFit="cover" accessibilityLabel="Foto do animal" />
      ) : (
        <Ionicons name="camera-outline" size={Math.round(size * 0.4)} color={isDark ? '#A8B8AF' : '#7A8B80'} accessibilityLabel="Sem foto neste aparelho" />
      )}
    </YStack>
  )
}
