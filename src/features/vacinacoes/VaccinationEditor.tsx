import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import { vaccinesApi, type Vaccine } from '@/api/catalog'
import { listAllPages, type VaccinationEntry, type VaccinationPayload } from '@/api/contract'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { vaccinationsApi } from '@/api/vaccinations'
import { AnimalPicker, type PickedAnimal } from '@/components/cadastros/AnimalPicker'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { SelectField } from '@/components/cadastros/SelectField'
import { DateField } from '@/components/form/DateField'
import { addDaysIso, formatDatePtBr, todayIso } from '@/features/cadastros/dates'

type VaccinationEditorProps = {
  vaccinationId?: string
}

function pluralDias(days: number) {
  return days === 1 ? '1 dia' : `${days} dias`
}

export function VaccinationEditor({ vaccinationId }: VaccinationEditorProps) {
  const isEdit = Boolean(vaccinationId)
  const [animal, setAnimal] = useState<PickedAnimal | null>(null)
  const [vaccineId, setVaccineId] = useState('')
  const [appliedAt, setAppliedAt] = useState<string>(() => todayIso())
  const [vaccines, setVaccines] = useState<Vaccine[]>([])
  const [original, setOriginal] = useState<VaccinationEntry | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [vaccineList, entry] = await Promise.all([
          listAllPages(vaccinesApi.list),
          vaccinationId ? vaccinationsApi.get(vaccinationId) : Promise.resolve(null),
        ])
        if (cancelled) return
        setVaccines(vaccineList)
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
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar o lançamento.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vaccinationId, reloadKey])

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
      if (isEdit && vaccinationId) await vaccinationsApi.update(vaccinationId, payload)
      else await vaccinationsApi.create(payload)
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
      await vaccinationsApi.remove(vaccinationId)
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
