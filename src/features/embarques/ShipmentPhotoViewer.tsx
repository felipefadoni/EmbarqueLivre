import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Modal, Pressable, StatusBar, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'
import { useShipmentPhotoSource } from './shipmentPhotoSource'

type Props = {
  open: boolean
  onClose: () => void
  shipmentId: string
  localUri?: string | null
  photoId?: string | null
  /** Brinco/código do animal (legenda). */
  title?: string | null
}

type LoadState = 'loading' | 'loaded' | 'error'

/** Paleta fixa (escura) do visualizador, igual nos temas claro e escuro (tokens brand* fixos). */
const INK = '#2B3D34'

/**
 * Foto do animal em tela cheia (o maior tamanho que cabe, sem cortar). Fecha no botão "Fechar", tocando fora da foto
 * ou no voltar do Android. Carregando: spinner; erro (offline, foto ainda não enviada, sessão): mensagem e
 * "Tentar de novo", sem quebrar a tela.
 */
export function ShipmentPhotoViewer({ open, onClose, shipmentId, localUri, photoId, title }: Props) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { source, attempt, reload } = useShipmentPhotoSource({ shipmentId, localUri, photoId }, open)
  // Cada abertura/tentativa começa em "carregando" (estado derivado da chave, sem setState em efeito).
  const [opens, setOpens] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpens((n) => n + 1)
  }
  const token = `${opens}-${attempt}`
  const [loaded, setLoaded] = useState<{ token: string; state: LoadState } | null>(null)
  const state: LoadState = loaded?.token === token ? loaded.state : 'loading'
  const setState = (next: LoadState) => setLoaded({ token, state: next })

  const top = Math.max(insets.top, 16)
  const bottom = Math.max(insets.bottom, 16)
  // Espaço da foto: tela inteira menos o cabeçalho (botão Fechar) e o rodapé (dica).
  const imageWidth = width - 24
  const imageHeight = Math.max(160, height - top - bottom - 140)
  const caption = title ? `Animal ${title}` : 'Foto do animal'

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait']}>
      <StatusBar barStyle="light-content" />
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(43, 61, 52, 0.96)', paddingTop: top, paddingBottom: bottom }}
        onPress={onClose}
        accessibilityViewIsModal
        accessibilityLabel="Fechar foto">
        <XStack px={16} pb={12} items="center" justify="space-between" gap={12}>
          <Text flex={1} fontSize={18} fontWeight="800" color="brandAqua" numberOfLines={1}>
            {caption}
          </Text>
          <XStack
            minH={TOQUE_MINIMO}
            px={16}
            gap={6}
            items="center"
            justify="center"
            rounded={999}
            bg="brandAqua"
            opacity={{ default: 1, press: 0.85 }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={INK} />
            <Text fontSize={16} fontWeight="800" color="brandInk">
              Fechar
            </Text>
          </XStack>
        </XStack>

        <YStack flex={1} items="center" justify="center" px={12}>
          {/* Tocar na própria foto não fecha (só fora dela). */}
          <Pressable onPress={(event) => event.stopPropagation()} accessible={false}>
            <YStack style={{ width: imageWidth, height: imageHeight }} items="center" justify="center">
              {source && state !== 'error' ? (
                <Image
                  key={token}
                  source={source}
                  style={{ width: imageWidth, height: imageHeight }}
                  contentFit="contain"
                  transition={150}
                  accessibilityLabel={caption}
                  onLoad={() => setState('loaded')}
                  onError={() => setState('error')}
                />
              ) : null}
              {state === 'loading' ? (
                <YStack position="absolute" items="center" gap={10}>
                  <Spinner size="large" color="brandAqua" />
                  <Text fontSize={16} fontWeight="700" color="brandSageLight">
                    Carregando foto…
                  </Text>
                </YStack>
              ) : null}
              {state === 'error' ? (
                <YStack items="center" gap={12} px={24} maxW={360}>
                  <Ionicons name="image-outline" size={48} color="#CEE3CD" />
                  <Text fontSize={17} fontWeight="800" color="brandAqua" text="center">
                    Não foi possível carregar a foto
                  </Text>
                  <Text fontSize={15} fontWeight="600" color="brandSageLight" text="center">
                    Confira a internet. Se o animal acabou de ser incluído, a foto aparece depois que for enviada.
                  </Text>
                  <XStack
                    minH={TOQUE_MINIMO}
                    px={20}
                    items="center"
                    justify="center"
                    rounded={16}
                    bg="brandSage"
                    opacity={{ default: 1, press: 0.85 }}
                    onPress={reload}
                    accessibilityRole="button"
                    accessibilityLabel="Tentar de novo">
                    <Text fontSize={16} fontWeight="800" color="brandInk">
                      Tentar de novo
                    </Text>
                  </XStack>
                </YStack>
              ) : null}
            </YStack>
          </Pressable>
        </YStack>

        <Text pt={12} px={16} fontSize={14} fontWeight="600" color="brandSageLight" text="center">
          Toque fora da foto para fechar
        </Text>
      </Pressable>
    </Modal>
  )
}
