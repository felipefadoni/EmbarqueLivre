import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import { USERS_CONTRACT } from '@/api/contract'
import { isApiError, publicApiMessage } from '@/api/errors'
import type { ApiError } from '@/api/types'
import { countAccountMasters, deleteUser, findUser, updateUser, type AccountUser, type CreatableRole } from '@/api/users'
import { AuthField } from '@/components/auth/AuthField'
import { FormBanner } from '@/components/auth/FormBanner'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { RoleBadge } from '@/components/cadastros/RoleBadge'
import { SelectField } from '@/components/cadastros/SelectField'
import { AppCard } from '@/components/dashboard/AppCard'
import { OfflineNotice } from '@/components/sync/OfflineNotice'
import { useAuth } from '@/features/auth/AuthProvider'
import { canManageUsers } from '@/features/cadastros/permissions'
import {
  createUserErrors,
  DELETE_BLOCK_MESSAGES,
  deleteBlockReason,
  ROLE_OPTIONS,
  userStatusLabel,
  validateUserEdit,
} from '@/features/usuarios/rules'
import { useIsOnline } from '@/sync/hooks'
import { TOQUE_MINIMO } from '../../../../../tamagui.config'

const asApiError = (error: unknown): ApiError => (isApiError(error) ? error : { status: 0, code: 'INTERNAL_ERROR' })

export default function UsuarioDetailScreen() {
  const { user } = useAuth()
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>()
  if (!canManageUsers(user?.role)) return <Redirect href="/configuracoes" />
  if (!id) return <Redirect href="/configuracoes/usuarios" />
  return <UsuarioDetail id={String(id)} hint={q ? String(q) : undefined} currentUserId={user?.id ?? null} />
}

type LoadState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; user: AccountUser; masters: number | null }

function UsuarioDetail({ id, hint, currentUserId }: { id: string; hint?: string; currentUserId: string | null }) {
  const online = useIsOnline()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Sem GET /account/users/:id: item do cache da lista → busca na lista (USERS_CONTRACT.detailPath quando existir).
  const load = useCallback(async () => {
    try {
      const found = await findUser(id, hint)
      if (!found) {
        setState({ status: 'error', message: publicApiMessage({ status: 404, code: 'USER_NOT_FOUND' }) })
        return
      }
      const masters = found.role === 'master' ? await countAccountMasters(found.accountId) : null
      setState({ status: 'ready', user: found, masters })
    } catch (error) {
      setState({ status: 'error', message: publicApiMessage(asApiError(error)) })
    }
  }, [id, hint])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) void load()
    })
    return () => {
      active = false
    }
  }, [load])

  async function onConfirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      // 204 = excluído; 404 depois do DELETE = já excluído (soft delete repetido): nos dois casos volta e a lista recarrega.
      await deleteUser(id)
      setConfirming(false)
      router.replace('/configuracoes/usuarios')
    } catch (error) {
      setConfirming(false)
      setDeleteError(publicApiMessage(asApiError(error)))
    } finally {
      setDeleting(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <YStack flex={1} bg="appBg" items="center" justify="center">
        <ActivityIndicator size="large" />
      </YStack>
    )
  }
  if (state.status === 'error') {
    return (
      <YStack flex={1} bg="appBg" p={20} gap={16}>
        <OfflineNotice />
        <FormBanner message={state.message} tone="error" />
        <ActionButton
          label="Tentar de novo"
          onPress={() => {
            setState({ status: 'loading' })
            void load()
          }}
        />
        <ActionButton label="Voltar para Usuários" onPress={() => router.replace('/configuracoes/usuarios')} />
      </YStack>
    )
  }

  const target = state.user
  const self = target.id === currentUserId
  const block = deleteBlockReason({ target, currentUserId, accountMastersCount: state.masters })

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      <OfflineNotice message="Sem internet. Gerenciar usuários precisa de conexão." />
      <AppCard>
        <YStack gap={12}>
          <Text fontSize={22} fontWeight="900" color="brandFg">
            {target.name || 'Sem nome'}
          </Text>
          <RoleBadge role={target.role} self={self} status={userStatusLabel(target)} />
          <Info label="Email" value={target.email} />
          {target.createdAt ? <Info label="Criado em" value={new Date(target.createdAt).toLocaleDateString('pt-BR')} /> : null}
        </YStack>
      </AppCard>
      {/* PATCH /account/users/:id { name?, role? } proposto: liga com USERS_CONTRACT.supportsEdit. */}
      {USERS_CONTRACT.supportsEdit && !self && target.role !== 'admin' ? (
        <EditUserCard
          user={target}
          online={online}
          isLastMaster={target.role === 'master' && state.masters != null && state.masters <= 1}
          onSaved={(user) => setState({ status: 'ready', user, masters: state.masters })}
        />
      ) : null}
      {deleteError ? <FormBanner message={deleteError} tone="error" /> : null}
      {block ? (
        <Text fontSize={16} fontWeight="600" color="brandMuted">
          {DELETE_BLOCK_MESSAGES[block]}
        </Text>
      ) : (
        <ActionButton label="Excluir usuário" danger disabled={!online || deleting} onPress={() => setConfirming(true)} />
      )}
      <ConfirmDialog
        open={confirming}
        title="Excluir usuário?"
        message={`${target.name} (${target.email}) perderá o acesso ao Embarque Livre e será desconectado de todos os aparelhos.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        busy={deleting}
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => setConfirming(false)}
      />
    </ScrollView>
  )
}

function EditUserCard({
  user,
  online,
  isLastMaster,
  onSaved,
}: {
  user: AccountUser
  online: boolean
  isLastMaster: boolean
  onSaved: (user: AccountUser) => void
}) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState<CreatableRole>(user.role === 'master' ? 'master' : 'basic')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSave() {
    if (saving || !online) return
    setFormError(null)
    const errors = validateUserEdit({ name, role })
    // Rebaixar o último master também deixaria a conta sem master (o backend responde LAST_MASTER).
    if (isLastMaster && role !== 'master') errors.role = 'Este é o último Usuário Master da conta.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    try {
      const patch = { name: name !== user.name ? name : undefined, role: role !== user.role ? role : undefined }
      onSaved(await updateUser(user.id, patch))
    } catch (error) {
      const result = createUserErrors(asApiError(error))
      setFieldErrors(result.fields)
      setFormError(result.banner)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppCard>
      <YStack gap={12}>
        <AuthField
          label="Nome"
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
          autoCapitalize="words"
          maxLength={150}
        />
        <SelectField
          label="Perfil"
          value={role}
          options={[...ROLE_OPTIONS]}
          error={fieldErrors.role}
          onChange={(value) => setRole(value === 'master' ? 'master' : 'basic')}
        />
        {formError ? <FormBanner message={formError} tone="error" /> : null}
        <ActionButton
          label={saving ? 'Salvando…' : 'Salvar alterações'}
          disabled={!online || saving}
          onPress={() => void onSave()}
        />
      </YStack>
    </AppCard>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <YStack gap={2}>
      <Text fontSize={15} fontWeight="700" color="brandMuted">
        {label}
      </Text>
      <Text fontSize={18} fontWeight="600" color="brandFg">
        {value}
      </Text>
    </YStack>
  )
}

function ActionButton({
  label,
  onPress,
  danger = false,
  disabled = false,
}: {
  label: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <XStack
      minH={TOQUE_MINIMO}
      items="center"
      justify="center"
      rounded={16}
      borderWidth={2}
      borderColor={danger ? 'brandError' : 'brandBorder'}
      opacity={{ default: disabled ? 0.55 : 1, press: 0.85 }}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}>
      <Text fontSize={18} fontWeight="800" color={danger ? 'brandError' : 'brandFg'}>
        {label}
      </Text>
    </XStack>
  )
}
