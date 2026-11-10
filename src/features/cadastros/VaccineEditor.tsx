import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import { vaccinesApi, type VaccinePayload } from '@/api/catalog'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { AuthField } from '@/components/auth/AuthField'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { LIMITS } from '@/features/cadastros/limits'
import { canManageCatalog } from '@/features/cadastros/permissions'
import { useAuth } from '@/features/auth/AuthProvider'

type VaccineEditorProps = {
  vaccineId?: string
}

export function VaccineEditor({ vaccineId }: VaccineEditorProps) {
  const isEdit = Boolean(vaccineId)
  const { user } = useAuth()
  const canManage = canManageCatalog(user?.role)
  const readOnly = !canManage
  const [name, setName] = useState('')
  const [withdrawalDays, setWithdrawalDays] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    if (!vaccineId) return
    setLoading(true)
    setLoadError(null)
    try {
      const vaccine = await vaccinesApi.get(vaccineId)
      setName(vaccine.name)
      setWithdrawalDays(String(vaccine.withdrawalDays))
    } catch (error) {
      setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar a vacina.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!vaccineId) return
    let cancelled = false
    ;(async () => {
      try {
        const vaccine = await vaccinesApi.get(vaccineId)
        if (cancelled) return
        setName(vaccine.name)
        setWithdrawalDays(String(vaccine.withdrawalDays))
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível carregar a vacina.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vaccineId])

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
      if (isEdit && vaccineId) await vaccinesApi.update(vaccineId, payload)
      else await vaccinesApi.create(payload)
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
    if (!vaccineId || deleting || readOnly) return
    setDeleting(true)
    setFormError(null)
    try {
      await vaccinesApi.remove(vaccineId)
      setConfirmOpen(false)
      router.back()
    } catch (error) {
      setConfirmOpen(false)
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível excluir a vacina.')
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
