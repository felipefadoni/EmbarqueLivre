import Ionicons from '@expo/vector-icons/Ionicons'
import { useQuery } from '@powersync/react'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, useColorScheme } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import type { Shipment } from '@/api/catalog'
import type { UserRole } from '@/api/types'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { formatWeightKg, SHIPMENTS_CONTRACT, todayIsoInShipmentZone } from '@/api/shipmentsContract'
import { FormBanner } from '@/components/auth/FormBanner'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { SelectField } from '@/components/cadastros/SelectField'
import { WithdrawalBadge } from '@/components/cadastros/WithdrawalBadge'
import { formatDatePtBr } from '@/features/cadastros/dates'
import { repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, showRejection } from '@/sync/editor'
import { PHOTO_STATUS_LABEL, type PhotoQueueStatus } from '@/sync/photoQueue'
import { resendPhoto } from '@/sync/useUploadPump'
import { rowToShipment, shipmentByIdQuery, shipmentLinkedAnimalsQuery, type ShipmentLinkedAnimalRow, type ShipmentRow } from '@/sync/queries'
import { TOQUE_MINIMO, TOQUE_PRINCIPAL } from '../../../tamagui.config'
import { ShipmentAnimalModal, type ShipmentAnimalModalTarget } from './ShipmentAnimalModal'
import { animalsCountLabel, dateChangeWithdrawalMessage, deleteConfirmMessage, finishConfirmMessage, isShipmentEditable } from './shipmentFlow'
import { ShipmentFields, validateShipmentForm } from './ShipmentForm'
import { ShipmentPhotoThumb } from './ShipmentPhotoThumb'
import { ShipmentStatusBadge } from './ShipmentStatusBadge'
import { exportShipmentReport } from './exportShipmentReport'
import { canExportShipment } from './shipmentReport'

const FORM_FIELDS = ['name', 'shippedOn', 'farmId', 'animalIds'] as const
const EMPTY_MESSAGE = 'Inclua pelo menos um animal antes de finalizar o embarque'

type Dialog = null | { kind: 'finish' } | { kind: 'delete' } | { kind: 'date' } | { kind: 'remove'; linkId: string; code: string }

/**
 * Detalhe do embarque.
 * - Em andamento: edita nome/dia (fazenda só leitura), adiciona animais (modal: foto + peso), ajusta peso/foto,
 *   remove, salva (botão no fim da rolagem) e finaliza (basic, master, admin; confirmação; ≥ 1 animal).
 * - Finalizado: só leitura (os animais continuam listados aqui, mas saem da lista de Animais).
 * - Excluir: só master/admin (canDelete).
 * - Exportar Dados (PDF + share sheet): só finalizado e só master/admin.
 */
export function ShipmentDetail({
  shipmentId,
  pendenciaId,
  openAdd,
  canDelete,
  canFinish,
  role,
}: {
  shipmentId: string
  pendenciaId?: string
  /** Abre o modal "Adicionar animal" ao entrar (vindo do Novo embarque). */
  openAdd?: boolean
  canDelete: boolean
  canFinish: boolean
  /** Papel do usuário: decide Exportar Dados (master/admin). */
  role?: UserRole | null
}) {
  const isDark = useColorScheme() === 'dark'
  const iconColor = isDark ? '#A8B8AF' : '#3A5247'
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [name, setName] = useState('')
  const [shippedOn, setShippedOn] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<ShipmentAnimalModalTarget | null>(null)
  const [exporting, setExporting] = useState(false)

  async function load() {
    try {
      const source = await loadEditorSource<ShipmentRow, Shipment>('shipments', shipmentByIdQuery(shipmentId), rowToShipment, pendenciaId)
      const record = source.record
      if (!record) {
        setLoadError('Embarque não encontrado neste aparelho. Ele pode ter sido excluído ou ainda não sincronizou.')
        return
      }
      const draft = source.rejection && source.rejection.tableName === SHIPMENTS_CONTRACT.table ? source.draft : null
      setShipment(record)
      setName(draftString(draft, 'name') ?? record.name)
      setShippedOn((draftString(draft, 'shippedOn') ?? record.shippedOn) || todayIsoInShipmentZone())
      showRejection(source.rejection, setFieldErrors, setFormError, FORM_FIELDS)
      if (openAdd && isShipmentEditable(record.status)) setModal({ kind: 'add' })
    } catch (error) {
      setLoadError(editorErrorMessage(error, 'Não foi possível carregar o embarque.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Leitura única do formulário (não sobrescreve a edição); assíncrona, fora do corpo do efeito.
    void Promise.resolve().then(load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, pendenciaId])

  // Status/contagem ao vivo (finalizar, sincronização).
  const liveQuery = shipmentByIdQuery(shipmentId)
  const live = useQuery<ShipmentRow>(liveQuery.sql, liveQuery.params)
  const liveShipment = live.data[0] ? rowToShipment(live.data[0]) : shipment
  const status = liveShipment?.status ?? 'in_progress'
  const editable = isShipmentEditable(status)

  // Animais NO embarque, com a carência avaliada no dia (editado) do embarque.
  const day = shippedOn || todayIsoInShipmentZone()
  const linkedQuery = shipmentLinkedAnimalsQuery(shipmentId, day)
  const linked = useQuery<ShipmentLinkedAnimalRow>(linkedQuery.sql, linkedQuery.params)
  const count = linked.data.length
  const savedDay = String(liveShipment?.shippedOn ?? '').slice(0, 10)
  const dateChanged = Boolean(shippedOn) && shippedOn !== savedDay
  const withdrawalOnNewDate = dateChanged ? linked.data.filter((row) => Boolean(row.inWithdrawal)).length : 0
  const dirty = Boolean(shipment) && (name.trim() !== (liveShipment?.name ?? '') || dateChanged)

  function showError(error: unknown, fallback: string) {
    const apiError = isApiError(error) ? error : null
    if (!apiError) {
      setFormError(fallback)
      return
    }
    const fields = fieldMessagesFromError(apiError)
    setFieldErrors(fields)
    const shownInField = Object.keys(fields).length > 0 && apiError.details?.field !== 'animalIds' && (apiError.code === 'VALIDATION_ERROR' || Boolean(apiError.details?.field))
    setFormError(shownInField ? null : publicApiMessage(apiError))
  }

  function validateFields(): boolean {
    if (!shipment) return false
    const errors = validateShipmentForm({ name, shippedOn, farmId: shipment.farmId }, { requireFarm: false })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function saveFields() {
    await repo.updateShipment(shipmentId, { name: name.trim(), shippedOn: shippedOn as string })
    await clearRowRejections('shipments', shipmentId)
    await clearPendencia(pendenciaId)
  }

  async function onSubmit(confirmedWithdrawal = false) {
    if (saving || !shipment) return
    setFormError(null)
    setNotice(null)
    if (!validateFields()) return
    // Carência não bloqueia (contrato final): só avisa e pede confirmação.
    if (withdrawalOnNewDate > 0 && !confirmedWithdrawal) {
      setDialog({ kind: 'date' })
      return
    }
    setSaving(true)
    try {
      await saveFields()
      router.back()
    } catch (error) {
      showError(error, 'Ocorreu um erro inesperado. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  function askFinish() {
    setFormError(null)
    setNotice(null)
    if (count === 0) {
      setFormError(EMPTY_MESSAGE)
      return
    }
    if (dirty && !validateFields()) return
    setDialog({ kind: 'finish' })
  }

  async function onConfirmDialog() {
    if (busy || !dialog) return
    setBusy(true)
    setFormError(null)
    try {
      if (dialog.kind === 'finish') {
        if (dirty) await saveFields()
        await repo.finishShipment(shipmentId)
        setNotice('Embarque finalizado. Os animais saíram da lista de Animais cadastrados.')
      } else if (dialog.kind === 'delete') {
        await repo.deleteShipment(shipmentId)
        await clearRowRejections('shipments', shipmentId)
        setDialog(null)
        router.back()
        return
      } else if (dialog.kind === 'remove') {
        await repo.removeShipmentAnimal(dialog.linkId)
        setNotice(`Animal ${dialog.code} removido do embarque.`)
      }
      setDialog(null)
    } catch (error) {
      setDialog(null)
      showError(error, 'Não foi possível concluir. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <YStack flex={1} bg="appBg" items="center" justify="center" gap={12}>
        <Spinner color="brandPrimary" size="large" />
        <Text fontSize={16} fontWeight="600" color="brandMuted">
          Carregando…
        </Text>
      </YStack>
    )
  }

  if (loadError || !shipment) {
    return (
      <YStack flex={1} bg="appBg" items="center" justify="center" gap={16} px={24}>
        <Text fontSize={18} fontWeight="800" color="brandFg" text="center">
          {loadError ?? 'Embarque não encontrado.'}
        </Text>
        <Text
          fontSize={18}
          fontWeight="800"
          color="brandFg"
          textDecorationLine="underline"
          onPress={() => {
            setLoading(true)
            setLoadError(null)
            void load()
          }}
          accessibilityRole="button">
          Tentar novamente
        </Text>
      </YStack>
    )
  }

  const shipmentRef = { id: shipmentId, farmId: shipment.farmId, farmName: shipment.farmName, shippedOn: day }
  const finishedOn = liveShipment?.finishedAt ? ` em ${formatDatePtBr(String(liveShipment.finishedAt).slice(0, 10))}` : ''

  const finishFooter =
    editable && canFinish ? (
      <YStack gap={8} mt={8}>
        <XStack
          minH={TOQUE_PRINCIPAL}
          items="center"
          justify="center"
          gap={8}
          rounded={16}
          borderWidth={2}
          borderColor="brandPrimary"
          opacity={{ default: saving || count === 0 ? 0.55 : 1, press: 0.85 }}
          onPress={saving ? undefined : askFinish}
          accessibilityRole="button"
          accessibilityLabel="Finalizar embarque"
          accessibilityHint="Depois de finalizado, o embarque não pode mais ser editado">
          <Ionicons name="flag-outline" size={22} color={iconColor} />
          <Text fontSize={18} fontWeight="800" color="brandFg">
            Finalizar embarque
          </Text>
        </XStack>
        <Text fontSize={14} fontWeight="500" color="brandMuted" text="center">
          {count ? 'Ao finalizar, o embarque fica só leitura.' : 'Adicione pelo menos um animal para finalizar.'}
        </Text>
      </YStack>
    ) : null

  const canExport = canExportShipment(role, status)

  async function onExport() {
    if (exporting) return
    setFormError(null)
    setNotice(null)
    setExporting(true)
    try {
      const result = await exportShipmentReport(shipmentId, role)
      if (result.photosMissing > 0) {
        const n = result.photosMissing
        setNotice(
          `PDF gerado. ${n === 1 ? '1 foto não carregou e aparece' : `${n} fotos não carregaram e aparecem`} como "Foto indisponível" (confira a internet).`,
        )
      }
    } catch (error) {
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  // Finalizado: só leitura. Exportar Dados (master/admin) e Excluir (master/admin) no fim da rolagem.
  const finishedFooter =
    !editable && (canExport || canDelete) ? (
      <YStack gap={8} mt={8}>
        {canExport ? (
          <>
            <XStack
              minH={TOQUE_PRINCIPAL}
              items="center"
              justify="center"
              gap={8}
              rounded={16}
              bg="brandPrimary"
              opacity={{ default: exporting ? 0.7 : 1, press: 0.85 }}
              onPress={exporting ? undefined : () => void onExport()}
              accessibilityRole="button"
              accessibilityLabel="Exportar Dados"
              accessibilityHint="Gera o relatório do embarque em PDF e abre as opções para salvar ou enviar"
              accessibilityState={{ busy: exporting, disabled: exporting }}>
              {exporting ? <Spinner color="brandPrimaryFg" /> : <Ionicons name="document-text-outline" size={22} color={isDark ? '#2B3D34' : '#D1EFEF'} />}
              <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
                {exporting ? 'Gerando PDF…' : 'Exportar Dados'}
              </Text>
            </XStack>
            <Text fontSize={14} fontWeight="500" color="brandMuted" text="center">
              Relatório em PDF com foto, código e peso dos animais, total em kg e em arroba.
            </Text>
          </>
        ) : null}
        {canDelete ? (
          <XStack
            minH={TOQUE_MINIMO}
            items="center"
            justify="center"
            rounded={16}
            opacity={{ press: 0.85 }}
            onPress={() => setDialog({ kind: 'delete' })}
            accessibilityRole="button"
            accessibilityLabel="Excluir embarque">
            <Text fontSize={18} fontWeight="800" color="brandError">
              Excluir embarque
            </Text>
          </XStack>
        ) : null}
      </YStack>
    ) : null

  return (
    <>
      <CadastroFormScreen
        error={formError}
        submitLabel="Salvar embarque"
        submitting={saving}
        onSubmit={() => void onSubmit(false)}
        onDelete={editable && canDelete ? () => setDialog({ kind: 'delete' }) : undefined}
        deleteLabel="Excluir embarque"
        readOnly={!editable}
        readOnlyMessage={`Embarque finalizado${finishedOn}: somente leitura.`}
        footer={editable ? finishFooter : finishedFooter}>
        {notice ? <FormBanner message={notice} tone="info" /> : null}
        <ShipmentStatusBadge status={status} />
        {editable ? (
          <ShipmentFields
            name={name}
            onName={(value) => {
              setName(value)
              setFieldErrors((current) => ({ ...current, name: '' }))
            }}
            shippedOn={shippedOn}
            onShippedOn={(value) => {
              setShippedOn(value)
              setFieldErrors((current) => ({ ...current, shippedOn: '' }))
              setFormError(null)
            }}
            errors={fieldErrors}
          />
        ) : (
          <YStack gap={4}>
            <Text fontSize={22} fontWeight="800" color="brandFg">
              {liveShipment?.name}
            </Text>
            <Text fontSize={17} fontWeight="600" color="brandFg">
              Dia do embarque: {formatDatePtBr(savedDay)}
            </Text>
          </YStack>
        )}
        {/* Fazenda imutável. */}
        <SelectField
          label="Fazenda"
          value={shipment.farmId}
          options={[{ value: shipment.farmId, label: shipment.farmName || 'Fazenda não sincronizada' }]}
          onChange={() => undefined}
          disabled
        />
        {editable && withdrawalOnNewDate > 0 ? (
          <YStack bg="bloqueado" p="3" rounded={16} accessibilityRole="alert">
            <Text fontSize={16} lineHeight="22px" fontWeight="700" color="bloqueado-color">
              {dateChangeWithdrawalMessage(withdrawalOnNewDate, day)}
            </Text>
          </YStack>
        ) : null}

        <Text fontSize={20} fontWeight="800" color="brandFg" mt={8}>
          Animais ({animalsCountLabel(count)})
        </Text>
        {count ? (
          <Text fontSize={15} fontWeight="600" color="brandMuted" mt={-8}>
            Peso total: {formatWeightKg(liveShipment?.totalWeightKg ?? 0)}
          </Text>
        ) : null}
        {editable ? (
          <XStack
            minH={TOQUE_MINIMO}
            items="center"
            justify="center"
            gap={8}
            rounded={16}
            borderWidth={2}
            borderColor="brandBorder"
            bg="brandSurface"
            opacity={{ press: 0.85 }}
            onPress={() => {
              setNotice(null)
              setModal({ kind: 'add' })
            }}
            accessibilityRole="button"
            accessibilityLabel="Adicionar animal">
            <Ionicons name="add-circle-outline" size={22} color={iconColor} />
            <Text fontSize={17} fontWeight="800" color="brandFg">
              Adicionar animal
            </Text>
          </XStack>
        ) : null}
        {linked.isLoading ? (
          <Spinner color="brandPrimary" />
        ) : count === 0 ? (
          <Text fontSize={15} fontWeight="500" color="brandMuted">
            Nenhum animal neste embarque ainda. Cada animal entra com foto e peso.
          </Text>
        ) : (
          linked.data.map((row) => (
            <LinkedAnimalRow
              key={row.linkId}
              row={row}
              shipmentId={shipmentId}
              editable={editable}
              iconColor={iconColor}
              onAdjust={() =>
                setModal({
                  kind: 'edit',
                  linkId: row.linkId,
                  code: row.code ?? '',
                  weightKg: row.weightKg,
                  localUri: row.localPhotoUri,
                  photoId: row.photoId,
                  freeAt: row.freeAt ? String(row.freeAt).slice(0, 10) : null,
                  inWithdrawal: Boolean(row.inWithdrawal),
                })
              }
              onRemove={() => setDialog({ kind: 'remove', linkId: row.linkId, code: row.code ?? '' })}
              onRetry={() => {
                if (!row.photoId) return
                // Envia já e sempre informa o resultado (antes só marcava "pendente" e nada acontecia).
                void resendPhoto(row.photoId, row.linkId)
                  .then((result) => Alert.alert(result.ok ? 'Reenviar foto' : 'Foto não enviada', result.message))
                  .catch((error) => Alert.alert('Foto não enviada', String((error as Error)?.message ?? error)))
              }}
            />
          ))
        )}
      </CadastroFormScreen>

      {modal ? (
        <ShipmentAnimalModal
          open
          target={modal}
          shipment={shipmentRef}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null)
            setFormError(null)
            setNotice(message)
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === 'finish'}
        title="Finalizar embarque?"
        message={finishConfirmMessage(count)}
        confirmLabel="Finalizar"
        busyLabel="Finalizando…"
        tone="primary"
        onCancel={() => setDialog(null)}
        onConfirm={() => void onConfirmDialog()}
        busy={busy}
      />
      <ConfirmDialog
        open={dialog?.kind === 'date'}
        title="Animais em carência nessa data"
        message={`${dateChangeWithdrawalMessage(withdrawalOnNewDate, day)} Quer salvar a nova data mesmo assim?`}
        confirmLabel="Salvar mesmo assim"
        busyLabel="Salvando…"
        tone="primary"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null)
          void onSubmit(true)
        }}
        busy={saving}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title="Excluir embarque?"
        message={deleteConfirmMessage(status, count)}
        onCancel={() => setDialog(null)}
        onConfirm={() => void onConfirmDialog()}
        busy={busy}
      />
      <ConfirmDialog
        open={dialog?.kind === 'remove'}
        title="Remover animal?"
        message={`O animal ${dialog?.kind === 'remove' ? dialog.code : ''} sai deste embarque e volta para a lista de disponíveis. A foto e o peso são descartados.`}
        confirmLabel="Remover"
        busyLabel="Removendo…"
        onCancel={() => setDialog(null)}
        onConfirm={() => void onConfirmDialog()}
        busy={busy}
      />
    </>
  )
}

function LinkedAnimalRow({
  row,
  shipmentId,
  editable,
  iconColor,
  onAdjust,
  onRemove,
  onRetry,
}: {
  row: ShipmentLinkedAnimalRow
  shipmentId: string
  editable: boolean
  iconColor: string
  onAdjust: () => void
  onRemove: () => void
  onRetry: () => void
}) {
  const freeAt = row.freeAt ? String(row.freeAt).slice(0, 10) : null
  const photoStatus = (row.photoStatus ?? null) as PhotoQueueStatus | null
  const photoLine = photoStatus
    ? PHOTO_STATUS_LABEL[photoStatus]
    : row.photoId
      ? 'Foto no servidor'
      : 'Sem foto (incluído antes da foto obrigatória)'
  return (
    <YStack bg="cardBg" rounded={16} p={12} gap={10}>
      <XStack gap={12} items="center">
        <ShipmentPhotoThumb shipmentId={shipmentId} localUri={row.localPhotoUri} photoId={row.photoId} size={64} title={row.code} />
        <YStack flex={1} gap={2}>
          <Text fontSize={18} fontWeight="800" color="brandFg" numberOfLines={1}>
            {row.code}
          </Text>
          <Text fontSize={15} fontWeight="700" color="brandFg">
            {row.weightKg != null ? formatWeightKg(row.weightKg) : 'Peso não informado'}
          </Text>
          <Text fontSize={13} fontWeight="600" color={photoStatus === 'failed' ? 'brandError' : 'brandMuted'} numberOfLines={2}>
            {photoLine}
          </Text>
        </YStack>
        <WithdrawalBadge active={Boolean(row.inWithdrawal)} activeLabel={`Carência até ${formatDatePtBr(freeAt)}`} inactiveLabel={freeAt ? 'Livre' : 'Sem vacina'} />
      </XStack>
      {editable ? (
        <XStack gap={8} flexWrap="wrap">
          <RowAction icon="create-outline" label="Ajustar peso/foto" color={iconColor} onPress={onAdjust} />
          <RowAction icon="trash-outline" label="Remover" color={iconColor} onPress={onRemove} />
          {photoStatus === 'failed' ? <RowAction icon="refresh" label="Reenviar foto" color={iconColor} onPress={onRetry} /> : null}
        </XStack>
      ) : null}
    </YStack>
  )
}

function RowAction({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  return (
    <XStack
      style={{ flexGrow: 1 }}
      minH={TOQUE_MINIMO}
      items="center"
      justify="center"
      gap={6}
      px={12}
      rounded={14}
      borderWidth={2}
      borderColor="brandBorder"
      opacity={{ press: 0.85 }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={color} />
      <Text fontSize={15} fontWeight="800" color="brandFg">
        {label}
      </Text>
    </XStack>
  )
}
