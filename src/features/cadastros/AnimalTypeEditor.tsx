import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import { animalTypesApi, type AnimalTypePayload } from '@/api/catalog'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { AuthField } from '@/components/auth/AuthField'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { LIMITS } from '@/features/cadastros/limits'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'

type AnimalTypeEditorProps = {
  typeId?: string
}

export function AnimalTypeEditor({ typeId }: AnimalTypeEditorProps) {
  const isEdit = Boolean(typeId)
  const { user } = useAuth()
  const canManage = canManageCatalog(user?.role)
  const readOnly = !canManage
  const [name, setName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    if (!typeId) return
    setLoading(true)
    setLoadError(null)
    try {
      const item = await animalTypesApi.get(typeId)
      setName(item.name)
    } catch (error) {
      setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar o tipo de animal.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!typeId) return
    let cancelled = false
    ;(async () => {
      try {
        const item = await animalTypesApi.get(typeId)
        if (cancelled) return
        setName(item.name)
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar o tipo de animal.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [typeId])

  function validate(): boolean {
    const next: Record<string, string> = {}
    const nome = name.trim()
    if (!nome) next.name = 'Informe o nome do tipo de animal.'
    else if (nome.length < LIMITS.typeName.min || nome.length > LIMITS.typeName.max) {
      next.name = `O nome deve ter entre ${LIMITS.typeName.min} e ${LIMITS.typeName.max} caracteres.`
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (saving || readOnly) return
    setFormError(null)
    if (!validate()) return
    const payload: AnimalTypePayload = { name: name.trim() }
    setSaving(true)
    try {
      if (isEdit && typeId) await animalTypesApi.update(typeId, payload)
      else await animalTypesApi.create(payload)
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
    if (!typeId || deleting || readOnly) return
    setDeleting(true)
    setFormError(null)
    try {
      await animalTypesApi.remove(typeId)
      setConfirmOpen(false)
      router.back()
    } catch (error) {
      setConfirmOpen(false)
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível excluir o tipo de animal.')
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
        submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar tipo'}
        submitting={saving}
        onSubmit={() => void onSubmit()}
        onDelete={isEdit && !readOnly ? () => setConfirmOpen(true) : undefined}
        deleteLabel="Excluir tipo">
        <AuthField
          editable={!readOnly}
          label="Nome"
          value={name}
          onChangeText={(value) => {
            setName(value)
            setFieldErrors((current) => ({ ...current, name: '' }))
          }}
          error={fieldErrors.name}
          placeholder="Ex.: Bovina"
          maxLength={LIMITS.typeName.max}
          autoCapitalize="sentences"
          returnKeyType="done"
        />
      </CadastroFormScreen>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir tipo de animal?"
        message="Se houver animais vinculados, a API vai recusar a exclusão. Esta ação não pode ser desfeita."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
        busy={deleting}
      />
    </>
  )
}
