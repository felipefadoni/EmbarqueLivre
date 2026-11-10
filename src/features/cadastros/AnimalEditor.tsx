import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import {
  animalTypesApi,
  animalsApi,
  farmsApi,
  type AnimalPayload,
  type AnimalType,
  type Farm,
} from '@/api/catalog'
import { listAllPages } from '@/api/contract'
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

const SEX_OPTIONS = [
  { value: 'M', label: 'Macho' },
  { value: 'F', label: 'Fêmea' },
]

type AnimalEditorProps = {
  animalId?: string
}

export function AnimalEditor({ animalId }: AnimalEditorProps) {
  const isEdit = Boolean(animalId)
  const [code, setCode] = useState('')
  const [farmId, setFarmId] = useState('')
  const [animalTypeId, setAnimalTypeId] = useState('')
  const [sex, setSex] = useState('')
  const [breed, setBreed] = useState('')
  const [birthDate, setBirthDate] = useState<string | null>(null)
  const [withdrawal, setWithdrawal] = useState<AnimalWithdrawal | null>(null)
  const [farms, setFarms] = useState<Farm[]>([])
  const [types, setTypes] = useState<AnimalType[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [farmList, typeList] = await Promise.all([listAllPages(farmsApi.list), listAllPages(animalTypesApi.list)])
      setFarms(farmList)
      setTypes(typeList)
      if (animalId) {
        const animal = await animalsApi.get(animalId)
        setCode(animal.code)
        setFarmId(animal.farmId)
        setAnimalTypeId(animal.animalTypeId)
        setSex(animal.sex ?? '')
        setBreed(animal.breed ?? '')
        setBirthDate(animal.birthDate)
        setWithdrawal(animal.withdrawal)
      }
    } catch (error) {
      setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar os dados do animal.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [farmList, typeList] = await Promise.all([listAllPages(farmsApi.list), listAllPages(animalTypesApi.list)])
        if (cancelled) return
        setFarms(farmList)
        setTypes(typeList)
        if (animalId) {
          const animal = await animalsApi.get(animalId)
          if (cancelled) return
          setCode(animal.code)
          setFarmId(animal.farmId)
          setAnimalTypeId(animal.animalTypeId)
          setSex(animal.sex ?? '')
          setBreed(animal.breed ?? '')
          setBirthDate(animal.birthDate)
        setWithdrawal(animal.withdrawal)
        }
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar os dados do animal.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [animalId])

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
    }
    setSaving(true)
    try {
      if (isEdit && animalId) await animalsApi.update(animalId, payload)
      else await animalsApi.create(payload)
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
      await animalsApi.remove(animalId)
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
          onPress={() => void load()}
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
            setFieldErrors((current) => ({ ...current, farmId: '' }))
          }}
          disabled={farms.length === 0}
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
