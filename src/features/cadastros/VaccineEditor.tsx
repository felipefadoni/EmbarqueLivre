import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import type { VaccinePayload } from '@/api/catalog'
import { fieldMessagesFromError, isApiError, publicApiMessage, userMessage } from '@/api/errors'
import { AuthField } from '@/components/auth/AuthField'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { LIMITS } from '@/features/cadastros/limits'
import { canManageVaccines } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, showRejection } from '@/sync/editor'
import { vaccineByIdQuery, rowToVaccine } from '@/sync/queries'

type VaccineEditorProps = {
  vaccineId?: string
  /** Pendência (operação recusada pelo servidor) a corrigir. */
  pendenciaId?: string
}

export function VaccineEditor({ vaccineId, pendenciaId }: VaccineEditorProps) {
  const isEdit = Boolean(vaccineId)
  const { user } = useAuth()
  const canManage = canManageVaccines(user?.role)
  const readOnly = !canManage
  const [name, setName] = useState('')
  const [withdrawalDays, setWithdrawalDays] = useState('')
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
    if (!vaccineId && !pendenciaId) return
    try {
      const source = await loadEditorSource('vaccines', vaccineId ? vaccineByIdQuery(vaccineId) : null, rowToVaccine, pendenciaId)
      const item = source.record
      if (vaccineId && !item) {
        setLoadError('Vacina não encontrada neste aparelho. Ela pode ter sido excluída ou ainda não sincronizou.')
        return
      }
      const draft = source.draft
      setName(draftString(draft, 'name') ?? item?.name ?? '')
      setWithdrawalDays(draftString(draft, 'withdrawalDays') ?? (item ? String(item.withdrawalDays) : ''))
      showRejection(source.rejection, setFieldErrors, setFormError, ['name', 'withdrawalDays'])
    } catch (error) {
      setLoadError(editorErrorMessage(error, 'Não foi possível carregar a vacina.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaccineId, pendenciaId])

  function validate(): boolean {
    const next: Record<string, string> = {}
    const nome = name.trim()
    if (!nome) next.name = 'Informe o nome da vacina.'
    else if (nome.length < LIMITS.vaccineName.min || nome.length > LIMITS.vaccineName.max) {
      next.name = `O nome deve ter entre ${LIMITS.vaccineName.min} e ${LIMITS.vaccineName.max} caracteres.`
    }
    if (!withdrawalDays.trim()) next.withdrawalDays = 'Informe os dias de carência.'
    else if (!/^\d+$/.test(withdrawalDays.trim())) {
      next.withdrawalDays = 'Informe um número inteiro entre 0 e 3650.'
    } else {
      const days = Number(withdrawalDays)
      if (days < LIMITS.withdrawalDays.min || days > LIMITS.withdrawalDays.max) {
        next.withdrawalDays = 'Informe os dias de carência entre 0 e 3650.'
      }
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (saving || readOnly) return
    setFormError(null)
    if (!validate()) return
    const payload: VaccinePayload = { name: name.trim(), withdrawalDays: Number(withdrawalDays.trim()) }
    setSaving(true)
    try {
      // Grava no banco local; o PowerSync envia quando houver rede.
      const savedId = isEdit && vaccineId ? (await repo.updateVaccine(vaccineId, payload), vaccineId) : await repo.createVaccine(payload)
      await clearRowRejections('vaccines', savedId)
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
    if (!vaccineId || deleting || readOnly) return
    setDeleting(true)
    setFormError(null)
    try {
      await repo.deleteVaccine(vaccineId)
      await clearRowRejections('vaccines', vaccineId)
      setConfirmOpen(false)
      router.back()
    } catch (error) {
      setConfirmOpen(false)
      if (isApiError(error) && error.code === 'VACCINE_HAS_APPLICATIONS') {
        setFormError(userMessage(error))
      } else {
        setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível excluir a vacina.')
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
        readOnly={readOnly}
        error={formError}
        submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar vacina'}
        submitting={saving}
        onSubmit={() => void onSubmit()}
        onDelete={isEdit && !readOnly ? () => setConfirmOpen(true) : undefined}
        deleteLabel="Excluir vacina">
        <AuthField
          editable={!readOnly}
          label="Nome"
          value={name}
          onChangeText={(value) => {
            setName(value)
            setFieldErrors((current) => ({ ...current, name: '' }))
          }}
          error={fieldErrors.name}
          placeholder="Nome da vacina"
          maxLength={LIMITS.vaccineName.max}
          autoCapitalize="sentences"
          returnKeyType="next"
        />
        <AuthField
          editable={!readOnly}
          label="Dias de carência"
          value={withdrawalDays}
          onChangeText={(value) => {
            setWithdrawalDays(value.replace(/[^\d]/g, ''))
            setFieldErrors((current) => ({ ...current, withdrawalDays: '' }))
          }}
          error={fieldErrors.withdrawalDays}
          placeholder="0"
          keyboardType="number-pad"
          returnKeyType="done"
        />
      </CadastroFormScreen>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir vacina?"
        message="Esta ação não pode ser desfeita."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
        busy={deleting}
      />
    </>
  )
}
