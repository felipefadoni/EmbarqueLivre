/**
 * Regras da tela Usuários (puras, testáveis no Node). O backend é quem decide de verdade;
 * aqui só evitamos mandar o que certamente será recusado e mostramos o motivo em pt-BR.
 */
import { USERS_CONTRACT } from '@/api/contract'
import { fieldMessagesFromError, publicApiMessage } from '@/api/errors'
import type { ApiError, UserRole } from '@/api/types'
import { emailIsValid, nameIsValid, passwordIsValid } from '@/api/validation'

export const ROLE_LABELS: Record<UserRole, string> = {
  master: 'Usuário Master',
  basic: 'Usuário Basic',
  admin: 'Administrador',
}

export const ROLE_OPTIONS = [
  { value: 'master', label: ROLE_LABELS.master },
  { value: 'basic', label: ROLE_LABELS.basic },
] as const

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  pending_verification: 'Pendente',
  invited: 'Pendente',
  suspended: 'Suspenso',
  blocked: 'Bloqueado',
  inactive: 'Inativo',
  disabled: 'Inativo',
}

/** Selo discreto de situação: só quando NÃO está ativo ou não pode acessar. null = nada a mostrar. */
export function userStatusLabel(user: { status: string | null; canAccess: boolean }): string | null {
  const status = user.status?.toLowerCase() ?? null
  if (status && status !== USERS_CONTRACT.activeStatus)
    return STATUS_LABELS[status] ?? (user.canAccess ? 'Inativo' : 'Sem acesso')
  if (!user.canAccess) return 'Sem acesso'
  return null
}

export type DeleteBlock = 'CANNOT_DELETE_SELF' | 'LAST_MASTER' | 'ADMIN_USER' | null

/**
 * Bloqueios locais da exclusão:
 * - ninguém exclui a si mesmo;
 * - o último master da conta não pode ser excluído (só quando a contagem é conhecida; senão o backend decide);
 * - administradores não são gerenciados por aqui.
 */
export function deleteBlockReason(input: {
  target: { id: string; role: UserRole }
  currentUserId: string | null | undefined
  accountMastersCount: number | null
}): DeleteBlock {
  if (input.currentUserId && input.target.id === input.currentUserId) return 'CANNOT_DELETE_SELF'
  if (input.target.role === 'admin') return 'ADMIN_USER'
  if (input.target.role === 'master' && input.accountMastersCount != null && input.accountMastersCount <= 1) return 'LAST_MASTER'
  return null
}

export const DELETE_BLOCK_MESSAGES: Record<Exclude<DeleteBlock, null>, string> = {
  CANNOT_DELETE_SELF: 'Você não pode excluir o seu próprio usuário.',
  LAST_MASTER: 'Este é o último Usuário Master da conta e não pode ser excluído.',
  ADMIN_USER: 'Administradores não podem ser excluídos por aqui.',
}

export type NewUserForm = {
  name: string
  email: string
  password: string
  confirmPassword: string
  role: string
  /** Admin: conta escolhida no AccountPicker (accountId). */
  scopeId?: string
}

/** Mesmas regras e mensagens do cadastro (src/app/(auth)/cadastro.tsx), reaproveitando api/validation. */
export function validateNewUser(form: NewUserForm, opts: { isAdmin: boolean }): Record<string, string> {
  const next: Record<string, string> = {}
  if (!nameIsValid(form.name)) next.name = 'Informe um nome válido (mínimo 2 letras).'
  if (!form.email.trim()) next.email = 'Informe o email.'
  else if (!emailIsValid(form.email)) next.email = 'Informe um email válido.'
  if (!form.password) next.password = 'Informe a senha.'
  else if (!passwordIsValid(form.password)) {
    next.password = 'A senha precisa ter ao menos 8 caracteres, 1 letra maiúscula e 1 caractere especial.'
  }
  if (form.password !== form.confirmPassword) next.confirmPassword = 'As senhas não coincidem.'
  if (form.role !== 'master' && form.role !== 'basic') next.role = 'Selecione o perfil: Usuário Master ou Usuário Basic.'
  if (opts.isAdmin && !form.scopeId) next.scopeId = 'Selecione a conta do novo usuário.'
  return next
}

/** Código do backend → campo do formulário (quando o corpo não traz details.field). */
const CODE_FIELD: Record<string, string> = {
  EMAIL_ALREADY_EXISTS: 'email',
  USER_EMAIL_ALREADY_EXISTS: 'email',
  EMAIL_ALREADY_REGISTERED: 'email',
  EMAIL_BELONGS_TO_NON_ADMIN_USER: 'email',
  INVALID_EMAIL: 'email',
  INVALID_USER_NAME: 'name',
  WEAK_PASSWORD: 'password',
  INVALID_USER_ROLE: 'role',
  ACCOUNT_NOT_FOUND: 'scopeId',
  ACCOUNT_REQUIRED: 'scopeId',
  ONLY_MASTER_CAN_OWN_BASIC_USERS: 'scopeId',
}

/** Nomes de campo da API → campos do formulário (validação em array do Nest usa o 1º token). */
const API_FIELD: Record<string, string> = { accountId: 'scopeId', account: 'scopeId', masterId: 'scopeId' }

/** Erro do POST → mensagens nos campos certos + banner (o que não tiver campo). */
export function createUserErrors(error: ApiError): { fields: Record<string, string>; banner: string | null } {
  const fields: Record<string, string> = {}
  for (const [field, message] of Object.entries(fieldMessagesFromError(error))) fields[API_FIELD[field] ?? field] = message
  const codeField = CODE_FIELD[error.code]
  if (codeField && !fields[codeField]) fields[codeField] = publicApiMessage(error)
  if (Object.keys(fields).length > 0) return { fields, banner: null }
  return { fields, banner: publicApiMessage(error) }
}

/** Edição (PATCH proposto): mesmas regras de nome/perfil do cadastro. */
export function validateUserEdit(form: { name: string; role: string }): Record<string, string> {
  const next: Record<string, string> = {}
  if (!nameIsValid(form.name)) next.name = 'Informe um nome válido (mínimo 2 letras).'
  if (form.role !== 'master' && form.role !== 'basic') next.role = 'Selecione o perfil: Usuário Master ou Usuário Basic.'
  return next
}
