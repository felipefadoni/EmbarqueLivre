import { router } from 'expo-router'
import { useQuery } from '@powersync/react'
import { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import type { Vaccine } from '@/api/catalog'
import type { VaccinationEntry, VaccinationPayload } from '@/api/contract'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { db, repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, showRejection } from '@/sync/editor'
import {
  ALL_ROWS,
  animalByIdQuery,
  querySpread,
  rowToAnimal,
  rowToVaccination,
  rowToVaccine,
  vaccinationByIdQuery,
  vaccinesListQuery,
  type AnimalRow,
  type VaccinationRow,
} from '@/sync/queries'
import { AnimalPicker, type PickedAnimal } from '@/components/cadastros/AnimalPicker'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { SelectField } from '@/components/cadastros/SelectField'
import { DateField } from '@/components/form/DateField'
import { addDaysIso, formatDatePtBr, todayIso } from '@/features/cadastros/dates'

type VaccinationEditorProps = {
  vaccinationId?: string
  /** Pendência (operação recusada pelo servidor) a corrigir. */
  pendenciaId?: string
}

function pluralDias(days: number) {
  return days === 1 ? '1 dia' : `${days} dias`
}

export function VaccinationEditor({ vaccinationId, pendenciaId }: VaccinationEditorProps) {
  const isEdit = Boolean(vaccinationId)
  const [animal, setAnimal] = useState<PickedAnimal | null>(null)
  const [vaccineId, setVaccineId] = useState('')
  const [appliedAt, setAppliedAt] = useState<string>(() => todayIso())
  const [original, setOriginal] = useState<VaccinationEntry | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Vacinas: consulta local reativa (atualiza quando o sync traz o catálogo).
  const vaccinesQuery = vaccinesListQuery(ALL_ROWS)
  const vaccineRows = useQuery<{ id: string; name: string; withdrawalDays: number | null }>(vaccinesQuery.sql, vaccinesQuery.params)
  const vaccines: Vaccine[] = useMemo(() => vaccineRows.data.map(rowToVaccine), [vaccineRows.data])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const source = await loadEditorSource<VaccinationRow, VaccinationEntry>(
          'vaccinations',
          vaccinationId ? vaccinationByIdQuery(vaccinationId) : null,
          rowToVaccination,
          pendenciaId,
        )
        if (cancelled) return
        const entry = source.record
        if (vaccinationId && !entry) {
          setLoadError('Lançamento não encontrado neste aparelho. Ele pode ter sido excluído ou ainda não sincronizou.')
          return
        }
        const draft = source.draft
        if (entry) {
          setOriginal(entry)
          setAnimal({
            id: entry.animalId,
            code: entry.animalCode,
            farmName: entry.farmName || undefined,
            animalTypeName: entry.animalTypeName || undefined,
          })
          setVaccineId(entry.vaccineId)
          setAppliedAt(entry.appliedAt || todayIso())
        }
        // "Corrigir": valores recusados pelo servidor por cima do registro local.
        const draftAnimalId = draftString(draft, 'animalId')
        if (draftAnimalId && draftAnimalId !== entry?.animalId) {
          const row = await db.getOptional<AnimalRow>(...querySpread(animalByIdQuery(draftAnimalId, todayIso())))
          if (cancelled) return
          if (row) {
            const picked = rowToAnimal(row)
            setAnimal({ id: picked.id, code: picked.code, farmName: picked.farmName, animalTypeName: picked.animalTypeName })
          }
        }
        const draftVaccineId = draftString(draft, 'vaccineId')
        if (draftVaccineId) setVaccineId(draftVaccineId)
        const draftAppliedAt = draftString(draft, 'appliedAt')
        if (draftAppliedAt) setAppliedAt(draftAppliedAt.slice(0, 10))
        showRejection(source.rejection, setFieldErrors, setFormError, ['animalId', 'vaccineId', 'appliedAt'])
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(editorErrorMessage(error, 'Não foi possível carregar o lançamento.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vaccinationId, pendenciaId, reloadKey])

  const vaccineOptions = vaccines.map((vaccine) => ({
    value: vaccine.id,
    label: `${vaccine.name} (${pluralDias(vaccine.withdrawalDays)})`,
  }))
  if (original && original.vaccineId && !vaccines.some((vaccine) => vaccine.id === original.vaccineId)) {
    vaccineOptions.unshift({
      value: original.vaccineId,
      label: `${original.vaccineName} (${pluralDias(original.withdrawalDays)})`,
    })
  }

  const selectedVaccine = vaccines.find((vaccine) => vaccine.id === vaccineId)
  // Mesma vacina do registro: a API mantém a cópia de dias gravada; vacina trocada: usa a carência atual dela.
  const previewDays =
    original && original.vaccineId === vaccineId ? original.withdrawalDays : (selectedVaccine?.withdrawalDays ?? null)
  const previewUntil = previewDays != null && appliedAt ? addDaysIso(appliedAt, previewDays) : ''
  const showOfficial =
    original != null &&
    original.vaccineId === vaccineId &&
    original.appliedAt === appliedAt &&
    Boolean(original.withdrawalUntil)

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!animal?.id) next.animalId = 'Selecione o animal.'
    if (!vaccineId) next.vaccineId = 'Selecione a vacina.'
    if (!appliedAt) next.appliedAt = 'Informe a data de aplicação.'
    else if (appliedAt > todayIso()) next.appliedAt = 'A data de aplicação não pode ser no futuro.'
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (saving) return
    setFormError(null)
    if (!validate() || !animal) return
    const payload: VaccinationPayload = { animalId: animal.id, vaccineId, appliedAt }
    setSaving(true)
    try {
      // Grava no banco local (carência calculada aqui); o PowerSync envia quando houver rede.
      const savedId =
        isEdit && vaccinationId ? (await repo.updateVaccination(vaccinationId, payload), vaccinationId) : await repo.createVaccination(payload)
      await clearRowRejections('vaccinations', savedId)
      await clearPendencia(pendenciaId)
      router.back()
    } catch (error) {
      const apiError = isApiError(error) ? error : null
      if (!apiError) {
        setFormError('Ocorreu um erro inesperado. Tente novamente.')
        return
      }
      const fields = fieldMessagesFromError(apiError)
      setFieldErrors(fields)
      // Erro já exibido no campo (validação ou código de domínio com details.field): sem banner duplicado.
      const shownInField = Object.keys(fields).length > 0 && (apiError.code === 'VALIDATION_ERROR' || Boolean(apiError.details?.field))
      setFormError(shownInField ? null : publicApiMessage(apiError))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!vaccinationId || deleting) return
    setDeleting(true)
    setFormError(null)
    try {
      await repo.deleteVaccination(vaccinationId)
      await clearRowRejections('vaccinations', vaccinationId)
      setConfirmOpen(false)
      router.back()
    } catch (error) {
      setConfirmOpen(false)
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível excluir o lançamento.')
    } finally {
      setDeleting(false)
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

  if (loadError) {
    return (
      <YStack flex={1} bg="appBg" items="center" justify="center" gap={16} px={24}>
        <Text fontSize={18} fontWeight="800" color="brandFg" text="center">
          {loadError}
        </Text>
        <Text
          fontSize={18}
          fontWeight="800"
          color="brandFg"
          textDecorationLine="underline"
          onPress={() => {
            setLoading(true)
            setLoadError(null)
            setReloadKey((key) => key + 1)
          }}
          accessibilityRole="button">
          Tentar novamente
        </Text>
      </YStack>
    )
  }

  return (
    <>
      <CadastroFormScreen
        error={formError}
        submitLabel={isEdit ? 'Salvar alterações' : 'Informar vacina'}
        submitting={saving}
        onSubmit={() => void onSubmit()}
        onDelete={isEdit ? () => setConfirmOpen(true) : undefined}
        deleteLabel="Excluir lançamento">
        <AnimalPicker
          label="Animal"
          selected={animal}
          error={fieldErrors.animalId}
          onChange={(value) => {
            setAnimal(value)
            setFieldErrors((current) => ({ ...current, animalId: '' }))
          }}
        />
        <SelectField
          label="Vacina"
          value={vaccineId}
          options={vaccineOptions}
          placeholder={vaccineOptions.length ? 'Selecione a vacina' : 'Nenhuma vacina cadastrada'}
          error={fieldErrors.vaccineId}
          onChange={(value) => {
            setVaccineId(value)
            setFieldErrors((current) => ({ ...current, vaccineId: '' }))
          }}
          disabled={vaccineOptions.length === 0}
        />
        <DateField
          label="Data de aplicação"
          value={appliedAt}
          onChange={(value) => {
            setAppliedAt(value ?? todayIso())
            setFieldErrors((current) => ({ ...current, appliedAt: '' }))
          }}
          maximumDate={new Date()}
          optional={false}
          error={fieldErrors.appliedAt}
        />
        <YStack
          bg="brandSurface"
          borderColor="brandBorder"
          borderWidth={2}
          rounded={16}
          p={16}
          gap={6}
          accessibilityLiveRegion="polite">
          <Text fontSize={14} fontWeight="700" color="brandMuted">
            Prévia da carência
          </Text>
          {previewDays != null && previewUntil ? (
            <Text fontSize={18} fontWeight="800" color="brandFg">
              Carência: {pluralDias(previewDays)}, livre em {formatDatePtBr(previewUntil)}
            </Text>
          ) : (
            <Text fontSize={16} fontWeight="600" color="brandFg">
              Selecione a vacina e a data para ver a carência.
            </Text>
          )}
          {showOfficial && original ? (
            <Text fontSize={15} fontWeight="600" color="brandFg">
              Registrado no servidor: {pluralDias(original.withdrawalDays)}, livre em{' '}
              {formatDatePtBr(original.withdrawalUntil)}
            </Text>
          ) : null}
          <Text fontSize={14} lineHeight="20px" fontWeight="500" color="brandMuted">
            Prévia no aparelho: data de aplicação + dias de carência da vacina. O animal fica livre no próprio
            dia indicado. O valor oficial é calculado pelo servidor ao salvar.
          </Text>
        </YStack>
      </CadastroFormScreen>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir lançamento?"
        message="O lançamento desta vacina será removido e a carência do animal será recalculada. Esta ação não pode ser desfeita."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
        busy={deleting}
      />
    </>
  )
}
