import Ionicons from '@expo/vector-icons/Ionicons'
import { useMemo, useState } from 'react'
import { FlatList, Modal, Platform, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Spinner, Text, XStack, YStack } from 'tamagui'

import { isApiError, publicApiMessage } from '@/api/errors'
import { formatWeightKg, parseWeightKg, WEIGHT_HINT } from '@/api/shipmentsContract'
import { AuthField } from '@/components/auth/AuthField'
import { FormBanner } from '@/components/auth/FormBanner'
import { animateFiltersToggle, CollapsibleFilters, FilterToggle } from '@/components/cadastros/CollapsibleFilters'
import { ListLoadingFooter } from '@/components/cadastros/ListStatus'
import { SelectField } from '@/components/cadastros/SelectField'
import { WithdrawalBadge } from '@/components/cadastros/WithdrawalBadge'
import { KEYBOARD_SCROLL_PROPS, KeyboardAwareScrollView } from '@/components/form/KeyboardAwareScrollView'
import { formatDatePtBr } from '@/features/cadastros/dates'
import { ANIMAL_SITUATION_SUMMARY } from '@/features/cadastros/animalFilters'
import { repo } from '@/sync'
import { useKeysetList } from '@/sync/hooks'
import { isAnimalSituation, shipmentPickerSpec, type AnimalSituation, type ShipmentPickerRow } from '@/sync/queries'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../tamagui.config'
import { deleteLocalPhoto, openAppSettings, pickShipmentPhotoFromLibrary, takeShipmentPhoto, type PhotoResult } from './photoCapture'
import { withdrawalConfirmMessage } from './shipmentFlow'
import { ShipmentPhotoThumb } from './ShipmentPhotoThumb'

const SITUATION_OPTIONS: { value: '' | AnimalSituation; label: string }[] = [
  { value: '', label: 'Todas as situações' },
  { value: 'liberado', label: 'Liberados no dia do embarque' },
  { value: 'carencia', label: 'Em carência no dia do embarque' },
  { value: 'libera7', label: 'Ficam livres até 7 dias depois' },
  { value: 'sem_historico', label: 'Sem histórico de vacina' },
]

export type ShipmentAnimalModalTarget =
  | { kind: 'add' }
  | { kind: 'edit'; linkId: string; code: string; weightKg: number | null; localUri: string | null; photoId: string | null; freeAt: string | null; inWithdrawal: boolean }

type ShipmentRef = { id: string; farmId: string; farmName?: string; shippedOn: string }

type Picked = { animalId: string; code: string; detail: string; freeAt: string | null; inWithdrawal: boolean }

/**
 * Modal do animal no embarque.
 * - add: lista os animais cadastrados DAQUELA fazenda (não embarcados, fora deste embarque), filtros por brinco e
 *   Situação (no dia do embarque). Ao escolher: foto obrigatória (câmera; galeria só como alternativa) + peso em kg.
 *   Em carência: aviso + confirmação (não bloqueia). Vínculo, peso e foto entram na mesma writeTransaction.
 * - edit: ajustar peso e/ou foto de um animal já no embarque (só Em andamento).
 */
export function ShipmentAnimalModal({
  open,
  target,
  shipment,
  onClose,
  onSaved,
}: {
  open: boolean
  target: ShipmentAnimalModalTarget
  shipment: ShipmentRef
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <YStack flex={1} bg="appBg" pt={Platform.OS === 'android' ? insets.top : 0}>
        {open ? (
          target.kind === 'add' ? (
            <AddFlow shipment={shipment} onClose={onClose} onSaved={onSaved} />
          ) : (
            <CaptureStep
              shipment={shipment}
              picked={{ animalId: '', code: target.code, detail: '', freeAt: target.freeAt, inWithdrawal: target.inWithdrawal }}
              edit={target}
              onBack={onClose}
              backLabel="Fechar"
              onSaved={onSaved}
            />
          )
        ) : null}
      </YStack>
    </Modal>
  )
}

function AddFlow({ shipment, onClose, onSaved }: { shipment: ShipmentRef; onClose: () => void; onSaved: (message: string) => void }) {
  const [picked, setPicked] = useState<Picked | null>(null)
  if (picked) {
    return <CaptureStep shipment={shipment} picked={picked} onBack={() => setPicked(null)} backLabel="Voltar à lista" onSaved={onSaved} />
  }
  return <PickStep shipment={shipment} onClose={onClose} onPick={setPicked} />
}

function ModalHeader({ title, subtitle, actionLabel, onAction }: { title: string; subtitle?: string; actionLabel: string; onAction: () => void }) {
  return (
    <XStack px={20} pt={16} pb={8} items="center" gap={12}>
      <YStack flex={1} gap={2}>
        <Text fontSize={22} fontWeight="800" color="brandFg">
          {title}
        </Text>
        {subtitle ? (
          <Text fontSize={15} fontWeight="600" color="brandMuted">
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      <XStack minH={TOQUE_MINIMO} items="center" px={8} onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
        <Text fontSize={16} fontWeight="800" color="brandFg" textDecorationLine="underline">
          {actionLabel}
        </Text>
      </XStack>
    </XStack>
  )
}

function PickStep({ shipment, onClose, onPick }: { shipment: ShipmentRef; onClose: () => void; onPick: (picked: Picked) => void }) {
  const isDark = useColorScheme() === 'dark'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const insets = useSafeAreaInsets()
  const [code, setCode] = useState('')
  const [situacao, setSituacao] = useState<'' | AnimalSituation>('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Keyset (código + id, mesma ordem de antes) com scroll infinito, no lugar do LIMIT fixo de 2000.
  const trimmedCode = code.trim()
  const { items, loading, refreshing, loadingMore, hasMore, loadMore } = useKeysetList(
    () =>
      shipmentPickerSpec(
        { farmId: shipment.farmId, shipmentId: shipment.id, code: trimmedCode || undefined, situacao: situacao || undefined },
        shipment.shippedOn,
      ),
    (row: ShipmentPickerRow) => row,
    [shipment.farmId, shipment.id, shipment.shippedOn, trimmedCode, situacao],
  )
  const parts = [situacao ? ANIMAL_SITUATION_SUMMARY[situacao] : '', code.trim() ? `Brinco "${code.trim()}"` : ''].filter(Boolean)

  function toggleFilters(next = !filtersOpen) {
    animateFiltersToggle()
    setFiltersOpen(next)
  }

  return (
    <YStack flex={1}>
      <ModalHeader
        title="Adicionar animal"
        subtitle={`${shipment.farmName || 'Fazenda'} · dia ${formatDatePtBr(shipment.shippedOn)}`}
        actionLabel="Fechar"
        onAction={onClose}
      />
      <YStack px={20} pb={8} gap={12}>
        <XStack items="center" gap={12}>
          <XStack flex={1} minH={TOQUE_MINIMO} items="center" bg="brandSurface" borderColor="brandBorder" borderWidth={2} rounded={16} px="3" gap={8}>
            <Ionicons name="search" size={20} color={iconColor} />
            <Input
              flex={1}
              h="100%"
              fontSize={18}
              fontWeight="600"
              color="brandFg"
              bg="transparent"
              borderWidth={0}
              placeholder="Buscar pelo brinco"
              placeholderTextColor="brandMuted"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Buscar animal pelo brinco"
            />
          </XStack>
          <FilterToggle open={filtersOpen} activeCount={situacao ? 1 : 0} onPress={() => toggleFilters()} />
        </XStack>
        <CollapsibleFilters
          open={filtersOpen}
          summary={parts.join(' · ') || 'Todos os animais da fazenda'}
          onOpen={() => toggleFilters(true)}
          onClear={() => setSituacao('')}
          clearable={Boolean(situacao)}>
          <SelectField
            label="Situação"
            value={situacao}
            options={SITUATION_OPTIONS}
            onChange={(value) => setSituacao(isAnimalSituation(value) ? value : '')}
          />
        </CollapsibleFilters>
      </YStack>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) + 20, gap: 8, flexGrow: 1 }}
        onEndReached={() => {
          if (hasMore && !loading && !refreshing && !loadingMore) loadMore()
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ListLoadingFooter /> : undefined}
        ListEmptyComponent={
          loading ? (
            <Spinner color="brandPrimary" />
          ) : (
            <Text fontSize={16} fontWeight="600" color="brandMuted" mt={16}>
              {code || situacao ? 'Nenhum animal com esses filtros.' : 'Nenhum animal cadastrado disponível nesta fazenda.'}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const inOther = Boolean(item.otherShipmentId)
          const freeAt = item.freeAt ? String(item.freeAt).slice(0, 10) : null
          const inWithdrawal = Boolean(item.inWithdrawal)
          const detail = [item.animalTypeName || 'Tipo não informado', item.herdName].filter(Boolean).join(' · ')
          return (
            <XStack
              items="center"
              gap={12}
              minH={TOQUE_MINIMO}
              px={12}
              py={10}
              rounded={16}
              bg="cardBg"
              opacity={{ default: inOther ? 0.6 : 1, press: 0.85 }}
              onPress={inOther ? undefined : () => onPick({ animalId: item.id, code: item.code ?? '', detail, freeAt, inWithdrawal })}
              accessibilityRole="button"
              accessibilityState={{ disabled: inOther }}
              accessibilityLabel={inOther ? `Animal ${item.code}, já no embarque ${item.otherShipmentName ?? ''}` : `Escolher animal ${item.code}`}>
              <YStack flex={1} gap={2}>
                <Text fontSize={18} fontWeight="800" color="brandFg">
                  {item.code}
                </Text>
                <Text fontSize={14} fontWeight="500" color="brandMuted" numberOfLines={1}>
                  {inOther ? `Já está no embarque ${item.otherShipmentName || 'sem nome'}` : detail}
                </Text>
              </YStack>
              {inWithdrawal ? (
                <WithdrawalBadge active activeLabel={`Carência até ${formatDatePtBr(freeAt)}`} inactiveLabel="" />
              ) : (
                <WithdrawalBadge active={false} activeLabel="" inactiveLabel={freeAt ? 'Livre' : 'Sem vacina'} />
              )}
            </XStack>
          )
        }}
      />
    </YStack>
  )
}

function CaptureStep({
  shipment,
  picked,
  edit,
  onBack,
  backLabel,
  onSaved,
}: {
  shipment: ShipmentRef
  picked: Picked
  edit?: Extract<ShipmentAnimalModalTarget, { kind: 'edit' }>
  onBack: () => void
  backLabel: string
  onSaved: (message: string) => void
}) {
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'
  const checkColor = isDark ? '#7DFFB3' : '#1B6B43'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [photoProblem, setPhotoProblem] = useState<Exclude<PhotoResult, { kind: 'ok' } | { kind: 'canceled' }> | null>(null)
  const [busyPhoto, setBusyPhoto] = useState(false)
  const [weight, setWeight] = useState(edit?.weightKg != null ? String(edit.weightKg).replace('.', ',') : '')
  const [weightError, setWeightError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weightKg = useMemo(() => parseWeightKg(weight), [weight])
  const hasPhoto = Boolean(photoUri) || Boolean(edit && (edit.localUri || edit.photoId))
  // Carência não bloqueia (contrato final): o app avisa e pede confirmação explícita antes de adicionar.
  const needsConfirm = !edit && picked.inWithdrawal
  const ready = hasPhoto && weightKg != null && (!needsConfirm || confirmed)

  function discardAndBack() {
    if (photoUri) deleteLocalPhoto(photoUri)
    onBack()
  }

  async function capture(from: 'camera' | 'library') {
    if (busyPhoto) return
    setBusyPhoto(true)
    setError(null)
    try {
      const result = from === 'camera' ? await takeShipmentPhoto() : await pickShipmentPhotoFromLibrary()
      if (result.kind === 'ok') {
        if (photoUri) deleteLocalPhoto(photoUri)
        setPhotoUri(result.uri)
        setPhotoProblem(null)
      } else if (result.kind !== 'canceled') {
        setPhotoProblem(result)
      }
    } finally {
      setBusyPhoto(false)
    }
  }

  async function save() {
    if (saving) return
    setError(null)
    if (weightKg == null) {
      setWeightError(WEIGHT_HINT)
      return
    }
    if (!hasPhoto) {
      setError('Tire uma foto do animal para continuar. A foto é obrigatória.')
      return
    }
    if (needsConfirm && !confirmed) {
      setError('Confirme que quer adicionar o animal mesmo em carência.')
      return
    }
    setSaving(true)
    try {
      if (edit) {
        await repo.updateShipmentAnimal(edit.linkId, { weightKg, ...(photoUri ? { photoUri } : {}) })
        onSaved(`Animal ${picked.code} atualizado.`)
      } else {
        await repo.addShipmentAnimal(shipment.id, { animalId: picked.animalId, weightKg, photoUri })
        onSaved(`Animal ${picked.code} adicionado ao embarque.`)
      }
    } catch (caught) {
      if (isApiError(caught) && caught.code === 'INVALID_SHIPMENT_ANIMAL_WEIGHT') setWeightError(WEIGHT_HINT)
      setError(isApiError(caught) ? publicApiMessage(caught) : 'Ocorreu um erro inesperado. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const title = edit ? `Ajustar ${picked.code}` : `Animal ${picked.code}`
  return (
    <YStack flex={1}>
      <ModalHeader title={title} subtitle={picked.detail || undefined} actionLabel={backLabel} onAction={discardAndBack} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 20, gap: 16 }}>
        {error ? <FormBanner message={error} /> : null}

        {picked.inWithdrawal ? (
          <YStack bg="bloqueado" p="3" rounded={16} gap={10} accessibilityRole="alert">
            <Text fontSize={16} lineHeight="22px" fontWeight="700" color="bloqueado-color">
              {withdrawalConfirmMessage(picked.code, picked.freeAt, shipment.shippedOn)}
            </Text>
            {needsConfirm ? (
              <XStack
                items="center"
                gap={10}
                minH={TOQUE_MINIMO}
                onPress={() => setConfirmed((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: confirmed }}
                accessibilityLabel="Confirmo adicionar mesmo em carência">
                <Ionicons name={confirmed ? 'checkbox' : 'square-outline'} size={26} color="white" />
                <Text flex={1} fontSize={16} fontWeight="800" color="bloqueado-color">
                  Confirmo adicionar mesmo em carência
                </Text>
              </XStack>
            ) : null}
          </YStack>
        ) : null}

        {/* 1) Foto obrigatória */}
        <YStack gap={10}>
          <Text fontSize={18} fontWeight="800" color="brandFg">
            1. Foto do animal (obrigatória)
          </Text>
          <XStack gap={12} items="center">
            <ShipmentPhotoThumb
              shipmentId={shipment.id}
              localUri={photoUri ?? edit?.localUri ?? null}
              photoId={photoUri ? null : edit?.photoId ?? null}
              size={96}
              title={edit?.code ?? picked.code ?? null}
            />
            <YStack flex={1} gap={8}>
              <XStack
                minH={TOQUE_MINIMO}
                items="center"
                justify="center"
                gap={8}
                rounded={16}
                bg="brandPrimary"
                opacity={{ default: busyPhoto ? 0.55 : 1, press: 0.85 }}
                onPress={busyPhoto ? undefined : () => void capture('camera')}
                accessibilityRole="button"
                accessibilityLabel={hasPhoto ? 'Tirar outra foto' : 'Tirar foto'}>
                {busyPhoto ? <Spinner color="brandPrimaryFg" /> : <Ionicons name="camera" size={22} color={isDark ? '#2B3D34' : '#FFFFFF'} />}
                <Text fontSize={17} fontWeight="800" color="brandPrimaryFg">
                  {hasPhoto ? 'Tirar outra foto' : 'Tirar foto'}
                </Text>
              </XStack>
              <Text fontSize={13} fontWeight="600" color="brandMuted">
                A foto fica no aparelho e é enviada quando houver internet.
              </Text>
            </YStack>
          </XStack>
          {photoProblem ? (
            <YStack bg="brandSurface" p="3" rounded={16} gap={10} accessibilityRole="alert">
              <Text fontSize={15} lineHeight="22px" fontWeight="700" color="brandFg">
                {photoProblem.kind === 'denied'
                  ? 'O app não tem permissão para usar a câmera. Para tirar a foto, libere a câmera para o Embarque Livre nos Ajustes do aparelho e volte aqui.'
                  : photoProblem.message}
              </Text>
              {photoProblem.kind === 'denied' ? (
                <XStack minH={TOQUE_MINIMO} items="center" justify="center" rounded={14} borderWidth={2} borderColor="brandBorder" onPress={openAppSettings} accessibilityRole="button" accessibilityLabel="Abrir ajustes do aparelho">
                  <Ionicons name="settings-outline" size={20} color={iconColor} />
                  <Text fontSize={16} fontWeight="800" color="brandFg" ml={8}>
                    Abrir Ajustes
                  </Text>
                </XStack>
              ) : null}
              <XStack minH={TOQUE_MINIMO} items="center" justify="center" rounded={14} borderWidth={2} borderColor="brandBorder" onPress={() => void capture('library')} accessibilityRole="button" accessibilityLabel="Escolher foto da galeria">
                <Ionicons name="images-outline" size={20} color={iconColor} />
                <Text fontSize={16} fontWeight="800" color="brandFg" ml={8}>
                  Escolher da galeria
                </Text>
              </XStack>
            </YStack>
          ) : null}
        </YStack>

        {/* 2) Peso obrigatório */}
        <YStack gap={6}>
          <Text fontSize={18} fontWeight="800" color="brandFg">
            2. Peso (kg)
          </Text>
          <AuthField
            label="Peso do animal em kg"
            value={weight}
            onChangeText={(value) => {
              setWeight(value)
              setWeightError('')
            }}
            error={weightError || undefined}
            placeholder="Ex.: 452,5"
            keyboardType="decimal-pad"
            returnKeyType="done"
            accessibilityHint={WEIGHT_HINT}
          />
          <Text fontSize={13} fontWeight="600" color="brandMuted">
            {weightKg != null ? `Peso: ${formatWeightKg(weightKg)}` : WEIGHT_HINT}
          </Text>
        </YStack>

        <XStack
          minH={TOQUE_PRINCIPAL}
          items="center"
          justify="center"
          gap={8}
          rounded={16}
          bg="brandPrimary"
          opacity={{ default: ready && !saving ? 1 : 0.55, press: 0.85 }}
          onPress={saving ? undefined : () => void save()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || saving, busy: saving }}
          accessibilityLabel={edit ? 'Salvar ajustes' : 'Adicionar ao embarque'}>
          {saving ? <Spinner color="brandPrimaryFg" /> : <Ionicons name={edit ? 'checkmark' : 'add'} size={22} color={checkColor === '#7DFFB3' ? '#2B3D34' : '#FFFFFF'} />}
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            {saving ? 'Salvando…' : edit ? 'Salvar ajustes' : 'Adicionar ao embarque'}
          </Text>
        </XStack>
      </KeyboardAwareScrollView>
    </YStack>
  )
}
