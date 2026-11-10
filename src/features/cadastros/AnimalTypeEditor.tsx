import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import type { AnimalTypePayload } from '@/api/catalog'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { AuthField } from '@/components/auth/AuthField'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { LIMITS } from '@/features/cadastros/limits'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, showRejection } from '@/sync/editor'
import { animalTypeByIdQuery, rowToAnimalType } from '@/sync/queries'

type AnimalTypeEditorProps = {
  typeId?: string
  /** Pendência (operação recusada pelo servidor) a corrigir. */
  pendenciaId?: string
}

export function AnimalTypeEditor({ typeId, pendenciaId }: AnimalTypeEditorProps) {
  const isEdit = Boolean(typeId)
  const { user } = useAuth()
  const canManage = canManageCatalog(user?.role)
  const readOnly = !canManage
  const [name, setName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit || Boolean(pendenciaId))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function retry() {
    setLoading(true)
    setLoadError(null)
    void load()
  }

  async function load() {
    if (!typeId && !pendenciaId) return
    try {
      const source = await loadEditorSource('animalTypes', typeId ? animalTypeByIdQuery(typeId) : null, rowToAnimalType, pendenciaId)
      const item = source.record
      if (typeId && !item) {
        setLoadError('Tipo de animal não encontrado neste aparelho. Ele pode ter sido excluído ou ainda não sincronizou.')
        return
      }
      setName(draftString(source.draft, 'name') ?? item?.name ?? '')
      showRejection(source.rejection, setFieldErrors, setFormError, ['name'])
    } catch (error) {
      setLoadError(editorErrorMessage(error, 'Não foi possível carregar o tipo de animal.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, pendenciaId])

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
      // Grava no banco local; o PowerSync envia quando houver rede.
      const savedId = isEdit && typeId ? (await repo.updateAnimalType(typeId, payload), typeId) : await repo.createAnimalType(payload)
      await clearRowRejections('animalTypes', savedId)
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
      // Erro já exibido no campo (validação ou nome duplicado com details.field): sem banner duplicado.
      const shownInField = Object.keys(fields).length > 0 && (apiError.code === 'VALIDATION_ERROR' || Boolean(apiError.details?.field))
      setFormError(shownInField ? null : publicApiMessage(apiError))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!typeId || deleting || readOnly) return
    setDeleting(true)
    setFormError(null)
    try {
      await repo.deleteAnimalType(typeId)
      await clearRowRejections('animalTypes', typeId)
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
        message="Tipos com animais vinculados não podem ser excluídos. Esta ação não pode ser desfeita."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
        busy={deleting}
      />
    </>
  )
}
