import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import { farmsApi, type FarmPayload } from '@/api/catalog'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { AuthField } from '@/components/auth/AuthField'
import { MasterPicker, OwnerReadOnlyField } from '@/components/cadastros/MasterPicker'
import type { MasterUser } from '@/api/masters'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { SelectField } from '@/components/cadastros/SelectField'
import { LIMITS } from '@/features/cadastros/limits'
import { labelUf, UFS } from '@/constants/ufs'

const UF_OPTIONS = UFS.map((item) => ({ value: item.uf, label: labelUf(item.uf) }))

type FarmEditorProps = {
  farmId?: string
}

export function FarmEditor({ farmId }: FarmEditorProps) {
  const isEdit = Boolean(farmId)
  const { user } = useAuth()
  const canManage = canManageCatalog(user?.role)
  const readOnly = !canManage
  const isAdmin = user?.role === 'admin'
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [ownerUserId, setOwnerUserId] = useState('')
  const [owner, setOwner] = useState<MasterUser | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    if (!farmId) return
    setLoading(true)
    setLoadError(null)
    try {
      const farm = await farmsApi.get(farmId)
      setName(farm.name)
      setCity(farm.city)
      setState(farm.state)
      setOwnerUserId(farm.ownerUserId)
      setOwner(
        farm.ownerUserId
          ? {
              id: farm.ownerUserId,
              name: farm.ownerName ?? '',
              email: farm.ownerEmail ?? '',
            }
          : null,
      )
    } catch (error) {
      setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar a fazenda.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!farmId) return
    let cancelled = false
    ;(async () => {
      try {
        const farm = await farmsApi.get(farmId)
        if (cancelled) return
        setName(farm.name)
        setCity(farm.city)
        setState(farm.state)
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar a fazenda.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [farmId])

  function validate(): boolean {
    const next: Record<string, string> = {}
    const nome = name.trim()
    const cidade = city.trim()
    if (!nome) next.name = 'Informe o nome da fazenda.'
    else if (nome.length < LIMITS.farmName.min || nome.length > LIMITS.farmName.max) {
      next.name = `O nome deve ter entre ${LIMITS.farmName.min} e ${LIMITS.farmName.max} caracteres.`
    }
    if (!cidade) next.city = 'Informe a cidade.'
    else if (cidade.length < LIMITS.city.min || cidade.length > LIMITS.city.max) {
      next.city = `A cidade deve ter entre ${LIMITS.city.min} e ${LIMITS.city.max} caracteres.`
    }
    if (!state.trim()) next.state = 'Selecione o estado.'
    if (!isEdit && isAdmin && !ownerUserId.trim()) {
      next.ownerUserId = 'Selecione o usuário master dono da fazenda.'
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (saving || readOnly) return
    setFormError(null)
    if (!validate()) return
    const payload: FarmPayload = { name: name.trim(), city: city.trim(), state }
    if (!isEdit && isAdmin) payload.ownerUserId = ownerUserId.trim()
    setSaving(true)
    try {
      if (isEdit && farmId) await farmsApi.update(farmId, payload)
      else await farmsApi.create(payload)
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
    if (!farmId || deleting || readOnly) return
    setDeleting(true)
    setFormError(null)
    try {
      await farmsApi.remove(farmId)
      setConfirmOpen(false)
      router.back()
    } catch (error) {
      setConfirmOpen(false)
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível excluir a fazenda.')
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
        readOnly={readOnly}
        error={formError}
        submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar fazenda'}
        submitting={saving}
        onSubmit={() => void onSubmit()}
        onDelete={isEdit && !readOnly ? () => setConfirmOpen(true) : undefined}
        deleteLabel="Excluir fazenda">
        <AuthField
          editable={!readOnly}
          label="Nome"
          value={name}
          onChangeText={(value) => {
            setName(value)
            setFieldErrors((current) => ({ ...current, name: '' }))
          }}
          error={fieldErrors.name}
          placeholder="Nome da fazenda"
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={LIMITS.farmName.max}
        />
        <AuthField
          editable={!readOnly}
          label="Cidade"
          value={city}
          onChangeText={(value) => {
            setCity(value)
            setFieldErrors((current) => ({ ...current, city: '' }))
          }}
          error={fieldErrors.city}
          placeholder="Cidade"
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={LIMITS.city.max}
        />
        <SelectField
          disabled={readOnly}
          label="Estado"
          value={state}
          options={UF_OPTIONS}
          placeholder="Selecione a UF"
          error={fieldErrors.state}
          onChange={(value) => {
            setState(value)
            setFieldErrors((current) => ({ ...current, state: '' }))
          }}
        />
        {isEdit ? (
          <OwnerReadOnlyField
            label="Dono da fazenda"
            name={owner?.name || undefined}
            email={owner?.email || undefined}
            ownerUserId={ownerUserId}
          />
        ) : isAdmin ? (
          <MasterPicker
            label="Dono da fazenda"
            value={ownerUserId}
            selected={owner}
            placeholder="Selecione o master dono"
            error={fieldErrors.ownerUserId}
            disabled={readOnly}
            onChange={(master) => {
              setOwnerUserId(master.id)
              setOwner(master)
              setFieldErrors((current) => ({ ...current, ownerUserId: '' }))
            }}
          />
        ) : null}
      </CadastroFormScreen>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir fazenda?"
        message="Se houver animais vinculados, a API vai recusar a exclusão. Esta ação não pode ser desfeita."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
        busy={deleting}
      />
    </>
  )
}
