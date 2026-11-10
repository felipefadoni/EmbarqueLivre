import { Redirect, router } from 'expo-router'
import { useState } from 'react'
import { Text, YStack } from 'tamagui'

import { isApiError } from '@/api/errors'
import type { Account } from '@/api/accounts'
import { createUser, type CreatableRole } from '@/api/users'
import { AuthField } from '@/components/auth/AuthField'
import { PasswordChecklist } from '@/components/auth/PasswordChecklist'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { AccountPicker } from '@/components/cadastros/AccountPicker'
import { SelectField } from '@/components/cadastros/SelectField'
import { OfflineNotice } from '@/components/sync/OfflineNotice'
import { useAuth } from '@/features/auth/AuthProvider'
import { canManageUsers } from '@/features/cadastros/permissions'
import { createUserErrors, ROLE_OPTIONS, validateNewUser } from '@/features/usuarios/rules'
import { useIsOnline } from '@/sync/hooks'

export default function NovoUsuarioScreen() {
  const { user } = useAuth()
  if (!canManageUsers(user?.role)) return <Redirect href="/configuracoes" />
  return <NovoUsuarioForm isAdmin={user?.role === 'admin'} />
}

function NovoUsuarioForm({ isAdmin }: { isAdmin: boolean }) {
  const online = useIsOnline()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [role, setRole] = useState<CreatableRole>('basic')
  const [account, setAccount] = useState<Account | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const clear = (field: string) => setFieldErrors((current) => ({ ...current, [field]: '' }))

  async function onSubmit() {
    if (saving || !online) return
    setFormError(null)
    const errors = validateNewUser({ name, email, password, confirmPassword, role, scopeId: account?.id }, { isAdmin })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    try {
      // Novo master entra na MESMA conta (com as mesmas fazendas): isso é do backend; o app só manda o perfil.
      await createUser({ name, email, password, role, accountId: isAdmin ? account?.id : undefined })
      router.replace('/configuracoes/usuarios')
    } catch (error) {
      const result = createUserErrors(isApiError(error) ? error : { status: 0, code: 'INTERNAL_ERROR' })
      setFieldErrors(result.fields)
      setFormError(result.banner)
    } finally {
      setSaving(false)
    }
  }

  const toggle = (shown: boolean, onPress: () => void, what: string) => (
    <Text
      onPress={onPress}
      fontSize={15}
      fontWeight="800"
      color="brandInk"
      pl="2"
      accessibilityRole="button"
      accessibilityLabel={shown ? `Ocultar ${what}` : `Mostrar ${what}`}>
      {shown ? 'Ocultar' : 'Mostrar'}
    </Text>
  )

  return (
    <CadastroFormScreen
      error={formError}
      submitLabel="Criar usuário"
      submitting={saving}
      submitDisabled={!online}
      onSubmit={() => void onSubmit()}>
      <OfflineNotice message="Sem internet. Criar usuários precisa de conexão." />
      <AuthField
        label="Nome"
        value={name}
        onChangeText={(v) => {
          setName(v)
          clear('name')
        }}
        error={fieldErrors.name}
        placeholder="Nome completo"
        autoCapitalize="words"
        maxLength={150}
      />
      <AuthField
        label="Email"
        value={email}
        onChangeText={(v) => {
          setEmail(v)
          clear('email')
        }}
        error={fieldErrors.email}
        placeholder="email@exemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
      />
      <YStack gap="2">
        <AuthField
          label="Senha"
          value={password}
          onChangeText={(v) => {
            setPassword(v)
            clear('password')
          }}
          error={fieldErrors.password}
          placeholder="Senha definida por você"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
          rightSlot={toggle(showPassword, () => setShowPassword((v) => !v), 'senha')}
        />
        <PasswordChecklist password={password} />
      </YStack>
      <AuthField
        label="Confirmar senha"
        value={confirmPassword}
        onChangeText={(v) => {
          setConfirmPassword(v)
          clear('confirmPassword')
        }}
        error={fieldErrors.confirmPassword}
        placeholder="Repita a senha"
        secureTextEntry={!showConfirm}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={128}
        rightSlot={toggle(showConfirm, () => setShowConfirm((v) => !v), 'confirmação da senha')}
      />
      <SelectField
        label="Perfil"
        value={role}
        options={[...ROLE_OPTIONS]}
        error={fieldErrors.role}
        onChange={(value) => {
          setRole(value === 'master' ? 'master' : 'basic')
          clear('role')
        }}
      />
      <Text fontSize={15} fontWeight="600" color="brandMuted">
        {role === 'master'
          ? 'Usuário Master entra na mesma conta, com as mesmas fazendas, e pode gerenciar cadastros e usuários.'
          : 'Usuário Basic lança vacinas e cadastra animais, mas não gerencia fazendas, catálogos nem usuários.'}
      </Text>
      {isAdmin ? (
        <AccountPicker
          label="Conta"
          value={account?.id ?? ''}
          selected={account}
          placeholder="Selecione a conta do novo usuário"
          error={fieldErrors.scopeId}
          onChange={(picked) => {
            setAccount(picked)
            clear('scopeId')
          }}
        />
      ) : null}
    </CadastroFormScreen>
  )
}
