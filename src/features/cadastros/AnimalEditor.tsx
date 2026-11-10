import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import { useQuery } from '@powersync/react'

import type { Animal, AnimalPayload } from '@/api/catalog'
import { fieldMessagesFromError, isApiError, publicApiMessage, userMessage } from '@/api/errors'
import { BIRTH_DATE_MIN, LIMITS } from '@/features/cadastros/limits'
import { parseIsoDateLocal } from '@/features/cadastros/dates'
import { AuthField } from '@/components/auth/AuthField'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { DateField } from '@/components/form/DateField'
import { SelectField } from '@/components/cadastros/SelectField'
import { WithdrawalSection } from '@/features/vacinacoes/WithdrawalSection'
import type { AnimalWithdrawal } from '@/api/contract'
import { todayIso } from '@/components/form/date'
import { repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, showRejection } from '@/sync/editor'
import {
  ALL_ROWS,
  animalApplicationsQuery,
  animalByIdQuery,
  animalTypesListQuery,
  farmsListQuery,
  herdsListQuery,
  rowToAnimal,
  rowToAnimalType,
  rowToFarm,
  rowToHerd,
  rowsToWithdrawal,
  type AnimalRow,
  type ApplicationRow,
  type FarmRow,
  type HerdRow,
} from '@/sync/queries'

const SEX_OPTIONS = [
  { value: 'M', label: 'Macho' },
  { value: 'F', label: 'Fêmea' },
]

type AnimalEditorProps = {
  animalId?: string
  /** Pendência (operação recusada pelo servidor) a corrigir. */
  pendenciaId?: string
}

export function AnimalEditor({ animalId, pendenciaId }: AnimalEditorProps) {
  const isEdit = Boolean(animalId)
  const [code, setCode] = useState('')
  const [farmId, setFarmId] = useState('')
  const [animalTypeId, setAnimalTypeId] = useState('')
  const [sex, setSex] = useState('')
  const [breed, setBreed] = useState('')
  const [birthDate, setBirthDate] = useState<string | null>(null)
  const [herdId, setHerdId] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Opções e carência são consultas locais reativas: atualizam sozinhas quando o sync traz dados.
  const farmsQuery = farmsListQuery(ALL_ROWS)
  const typesQuery = animalTypesListQuery(ALL_ROWS)
  const farmRows = useQuery<FarmRow>(farmsQuery.sql, farmsQuery.params)
  const typeRows = useQuery<{ id: string; name: string }>(typesQuery.sql, typesQuery.params)
  const farms = useMemo(() => farmRows.data.map(rowToFarm), [farmRows.data])
  const types = useMemo(() => typeRows.data.map(rowToAnimalType), [typeRows.data])
  const herdsQuery = herdsListQuery({ farmId: farmId || undefined }, ALL_ROWS)
  const herdRows = useQuery<HerdRow>(herdsQuery.sql, herdsQuery.params)
  const herds = useMemo(() => herdRows.data.map(rowToHerd), [herdRows.data])
  const today = todayIso()
  const applicationsQuery = animalApplicationsQuery(animalId ?? '')
  const applicationRows = useQuery<ApplicationRow>(applicationsQuery.sql, applicationsQuery.params)
  const withdrawal: AnimalWithdrawal | null = useMemo(
    () => (animalId ? rowsToWithdrawal(applicationRows.data, today) : null),
    [animalId, applicationRows.data, today],
  )

  function retry() {
    setLoading(true)
    setLoadError(null)
    void load()
  }

  async function load() {
    try {
      const source = await loadEditorSource<AnimalRow, Animal>('animals', animalId ? animalByIdQuery(animalId, todayIso()) : null, (row) => rowToAnimal(row), pendenciaId)
      const animal = source.record
      if (animalId && !animal) {
        setLoadError('Animal não encontrado neste aparelho. Ele pode ter sido excluído ou ainda não sincronizou.')
        return
      }
      const draft = source.draft
      setCode(draftString(draft, 'code') ?? animal?.code ?? '')
      setFarmId(draftString(draft, 'farmId') ?? animal?.farmId ?? '')
      setAnimalTypeId(draftString(draft, 'animalTypeId') ?? animal?.animalTypeId ?? '')
      setSex(draftString(draft, 'sex') ?? animal?.sex ?? '')
      setBreed(draftString(draft, 'breed') ?? animal?.breed ?? '')
      setBirthDate((draftString(draft, 'birthDate') ?? animal?.birthDate ?? '') || null)
      setHerdId(draftString(draft, 'herdId') ?? animal?.herdId ?? '')
      showRejection(source.rejection, setFieldErrors, setFormError, ['code', 'farmId', 'animalTypeId', 'sex', 'breed', 'birthDate', 'herdId'])
    } catch (error) {
      setLoadError(editorErrorMessage(error, 'Não foi possível carregar os dados do animal.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animalId, pendenciaId])

  function validate(): boolean {
    const next: Record<string, string> = {}
    const codigo = code.trim()
    if (!codigo) next.code = 'Informe o código ou brinco.'
    else if (codigo.length > LIMITS.animalCode.max) next.code = 'O código deve ter no máximo 50 caracteres.'
    if (!farmId) next.farmId = 'Selecione a fazenda.'
    if (!animalTypeId) next.animalTypeId = 'Selecione o tipo de animal.'
    if (breed.trim().length > LIMITS.breed.max) next.breed = 'A raça deve ter no máximo 100 caracteres.'
    if (birthDate) {
      const date = parseIsoDateLocal(birthDate)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      if (!date || date < BIRTH_DATE_MIN || date > today) {
        next.birthDate = 'Informe uma data de nascimento entre 01/01/1900 e hoje.'
      }
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (saving) return
    setFormError(null)
    if (!validate()) return
    const payload: AnimalPayload = {
      code: code.trim(),
      farmId,
      animalTypeId,
      sex: sex === 'M' || sex === 'F' ? sex : null,
      breed: breed.trim() ? breed.trim() : null,
      birthDate,
      herdId: herdId || null,
    }
    setSaving(true)
    try {
      // Grava no banco local (código único por fazenda checado aqui); o PowerSync envia quando houver rede.
      const savedId = isEdit && animalId ? (await repo.updateAnimal(animalId, payload), animalId) : await repo.createAnimal(payload)
      await clearRowRejections('animals', savedId)
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
      setFormError(Object.keys(fields).length > 0 && apiError.code === 'VALIDATION_ERROR' ? null : publicApiMessage(apiError))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!animalId || deleting) return
    setDeleting(true)
    setFormError(null)
    try {
      await repo.deleteAnimal(animalId)
      await clearRowRejections('animals', animalId)
      setConfirmOpen(false)
      router.back()
    } catch (error) {
      setConfirmOpen(false)
      if (isApiError(error) && error.code === 'ANIMAL_HAS_VACCINATIONS') {
        setFormError(userMessage(error))
      } else {
        setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível excluir o animal.')
      }
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
          onPress={retry}
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
        submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar animal'}
        submitting={saving}
        onSubmit={() => void onSubmit()}
        onDelete={isEdit ? () => setConfirmOpen(true) : undefined}
        deleteLabel="Excluir animal"
        footer={isEdit ? <WithdrawalSection withdrawal={withdrawal} /> : undefined}>
        <AuthField
          label="Código"
          value={code}
          onChangeText={(value) => {
            setCode(value)
            setFieldErrors((current) => ({ ...current, code: '' }))
          }}
          error={fieldErrors.code}
          placeholder="Brinco ou outro código"
          maxLength={LIMITS.animalCode.max}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="next"
        />
        <SelectField
          label="Fazenda"
          value={farmId}
          options={farms.map((farm) => ({ value: farm.id, label: farm.name }))}
          placeholder={farms.length ? 'Selecione a fazenda' : 'Nenhuma fazenda cadastrada'}
          error={fieldErrors.farmId}
          onChange={(value) => {
            setFarmId(value)
            setHerdId('')
            setFieldErrors((current) => ({ ...current, farmId: '', herdId: '' }))
          }}
          disabled={farms.length === 0}
        />
        <SelectField
          label="Rebanho"
          value={herdId}
          options={[{ value: '', label: 'Nenhum' }, ...herds.map((herd) => ({ value: herd.id, label: herd.name }))]}
          placeholder={farmId ? (herds.length ? 'Opcional' : 'Nenhum rebanho nesta fazenda') : 'Selecione a fazenda primeiro'}
          error={fieldErrors.herdId}
          onChange={(value) => {
            setHerdId(value)
            setFieldErrors((current) => ({ ...current, herdId: '' }))
          }}
          disabled={!farmId}
        />
        <SelectField
          label="Tipo de animal"
          value={animalTypeId}
          options={types.map((item) => ({ value: item.id, label: item.name }))}
          placeholder={types.length ? 'Selecione o tipo' : 'Nenhum tipo cadastrado'}
          error={fieldErrors.animalTypeId}
          onChange={(value) => {
            setAnimalTypeId(value)
            setFieldErrors((current) => ({ ...current, animalTypeId: '' }))
          }}
          disabled={types.length === 0}
        />
        <SelectField
          label="Sexo"
          value={sex}
          options={[{ value: '', label: 'Não informado' }, ...SEX_OPTIONS]}
          placeholder="Opcional"
          error={fieldErrors.sex}
          onChange={(value) => {
            setSex(value)
            setFieldErrors((current) => ({ ...current, sex: '' }))
          }}
        />
        <AuthField
          label="Raça"
          value={breed}
          onChangeText={(value) => {
            setBreed(value)
            setFieldErrors((current) => ({ ...current, breed: '' }))
          }}
          placeholder="Opcional"
          autoCapitalize="words"
          maxLength={LIMITS.breed.max}
          error={fieldErrors.breed}
        />
        <DateField
          label="Data de nascimento"
          value={birthDate}
          onChange={setBirthDate}
          minimumDate={BIRTH_DATE_MIN}
          maximumDate={new Date()}
          optional
          error={fieldErrors.birthDate}
        />
      </CadastroFormScreen>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir animal?"
        message={
          withdrawal && withdrawal.applications.length > 0
            ? 'Este animal possui vacinas lançadas. Exclua os lançamentos antes de excluir o animal.'
            : 'Esta ação não pode ser desfeita.'
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
        busy={deleting}
      />
    </>
  )
}
