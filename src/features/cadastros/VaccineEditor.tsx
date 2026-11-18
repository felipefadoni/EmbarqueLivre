import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import { vaccinesApi } from '@/api/catalog'
import { fieldMessagesFromError, isApiError, publicApiMessage, userMessage } from '@/api/errors'
import { AuthField } from '@/components/auth/AuthField'
import { AuthorLines } from '@/components/cadastros/AuthorLines'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { canSeeAuthor, type AuthorValue } from '@/features/cadastros/farmFilters'
import { LIMITS } from '@/features/cadastros/limits'
import { vaccineAccess, vaccineReadOnlyMessage } from '@/features/cadastros/vaccineAccess'
import { sanitizeWithdrawalDays, validateVaccineForm } from '@/features/cadastros/vaccineForm'
import { createRepoVaccineStore } from '@/features/cadastros/vaccineStore'
import { useAuth } from '@/features/auth/AuthProvider'
import { repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, showRejection } from '@/sync/editor'
import { vaccineByIdQuery, rowToVaccine } from '@/sync/queries'

// Gravação isolada atrás de um adaptador (troca para vacinas por conta sem mexer na tela; ver vaccineStore.ts).
const vaccineStore = createRepoVaccineStore(repo)

type VaccineEditorProps = {
  vaccineId?: string
  /** Pendência (operação recusada pelo servidor) a corrigir. */
  pendenciaId?: string
}

export function VaccineEditor({ vaccineId, pendenciaId }: VaccineEditorProps) {
  const isEdit = Boolean(vaccineId)
  const { user } = useAuth()
  const access = vaccineAccess(user?.role)
  const readOnly = isEdit ? !access.canEdit : !access.canCreate
  // Autor do catálogo: só o admin (consulta com o LEFT JOIN/colunas do autor); master/básico: SELECT de antes.
  const showAuthor = canSeeAuthor(user?.role, 'vaccines')
  const [author, setAuthor] = useState<AuthorValue | null>(null)
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
      const source = await loadEditorSource('vaccines', vaccineId ? vaccineByIdQuery(vaccineId, showAuthor) : null, rowToVaccine, pendenciaId)
      const item = source.record
      if (vaccineId && !item) {
        setLoadError('Vacina não encontrada neste aparelho. Ela pode ter sido excluída ou ainda não sincronizou.')
        return
      }
      setAuthor(showAuthor && item ? { name: item.createdByName, email: item.createdByEmail } : null)
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

  // Admin (todas as contas): nome da conta só vem no REST (o sync traz só account_id). Online; offline fica sem.
  const [accountName, setAccountName] = useState<string | null>(null)
  const showAccount = access.scope === 'all-accounts' && Boolean(vaccineId)
  useEffect(() => {
    if (!showAccount || !vaccineId) return
    let active = true
    vaccinesApi.get(vaccineId).then(
      (vaccine) => {
        if (active) setAccountName(vaccine.accountName ?? null)
      },
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [showAccount, vaccineId])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaccineId, pendenciaId, showAuthor])

  async function onSubmit() {
    if (saving || readOnly) return
    setFormError(null)
    const { errors, payload } = validateVaccineForm({ name, withdrawalDays })
    setFieldErrors(errors as Record<string, string>)
    if (!payload) return
    setSaving(true)
    try {
      // Grava no banco local; o PowerSync envia quando houver rede.
      const savedId = isEdit && vaccineId ? (await vaccineStore.update(vaccineId, payload), vaccineId) : await vaccineStore.create(payload)
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
    if (!vaccineId || deleting || readOnly || !access.canDelete) return
    setDeleting(true)
    setFormError(null)
    try {
      await vaccineStore.remove(vaccineId)
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
        <Text fontSize={16} fontWeight="800" color="brandFg" text="center">
          {loadError}
        </Text>
        <Text
          fontSize={16}
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
        readOnlyMessage={vaccineReadOnlyMessage(access)}
        error={formError}
        submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar vacina'}
        submitting={saving}
        onSubmit={() => void onSubmit()}
        onDelete={isEdit && !readOnly && access.canDelete ? () => setConfirmOpen(true) : undefined}
        deleteLabel="Excluir vacina">
        {showAuthor && author ? <AuthorLines author={author} /> : null}
        {showAccount && accountName ? (
          <Text fontSize={16} fontWeight="700" color="brandFg">
            Conta: {accountName}
          </Text>
        ) : null}
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
            setWithdrawalDays(sanitizeWithdrawalDays(value))
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
