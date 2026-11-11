import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, useColorScheme } from 'react-native'
import { YStack } from 'tamagui'

import { hasShipmentPhoto, useShipmentPhotoSource } from './shipmentPhotoSource'
import { ShipmentPhotoViewer } from './ShipmentPhotoViewer'

type Props = {
  shipmentId: string
  /** Arquivo local (fila de upload): preferido, funciona offline. */
  localUri?: string | null
  /** photo_id do vínculo: sem arquivo local, GET autenticado /shipments/:id/photos/:photoId. */
  photoId?: string | null
  size?: number
  /** Brinco/código do animal: legenda do visualizador e acessibilidade. */
  title?: string | null
  /** Tocar abre a foto em tela cheia (padrão: sim, quando há foto). */
  expandable?: boolean
}

/**
 * Miniatura da foto do animal no embarque: arquivo local; senão GET autenticado; senão um ícone.
 * Com foto, tocar abre o visualizador (vale para embarque em andamento e finalizado: só leitura).
 */
export function ShipmentPhotoThumb({ shipmentId, localUri, photoId, size = 64, title, expandable = true }: Props) {
  const isDark = useColorScheme() === 'dark'
  const ref = { shipmentId, localUri, photoId }
  const { source } = useShipmentPhotoSource(ref)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const canOpen = expandable && hasShipmentPhoto(ref)
  const iconColor = isDark ? '#A8B8AF' : '#7A8B80'
  const label = title ? `Foto do animal ${title}` : 'Foto do animal'

  const box = (
    <YStack style={{ width: size, height: size }} rounded={12} overflow="hidden" bg="brandSurface" items="center" justify="center" borderWidth={1} borderColor="brandBorder">
      {source && !failed ? (
        <Image
          source={source}
          style={{ width: size, height: size }}
          contentFit="cover"
          accessibilityLabel={label}
          onError={() => setFailed(true)}
          onLoad={() => setFailed(false)}
        />
      ) : (
        <Ionicons
          name={failed ? 'image-outline' : 'camera-outline'}
          size={Math.round(size * 0.4)}
          color={iconColor}
          accessibilityLabel={failed ? 'Foto não carregada' : 'Sem foto neste aparelho'}
        />
      )}
      {canOpen ? (
        <YStack position="absolute" r={4} b={4} rounded={999} p={3} style={{ backgroundColor: 'rgba(43, 61, 52, 0.72)' }}>
          <Ionicons name="expand-outline" size={12} color="#D1EFEF" />
        </YStack>
      ) : null}
    </YStack>
  )

  if (!canOpen) return box
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${label}. Toque para ver em tela cheia`}
        hitSlop={6}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
        {box}
      </Pressable>
      <ShipmentPhotoViewer
        open={open}
        onClose={() => {
          setOpen(false)
          setFailed(false)
        }}
        shipmentId={shipmentId}
        localUri={localUri}
        photoId={photoId}
        title={title}
      />
    </>
  )
}
