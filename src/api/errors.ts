import type { AxiosError } from 'axios'

import type { ApiError } from './types'

const DOMAIN_MESSAGES: Record<string, string> = {
  INVALID_USER_NAME: 'Informe um nome válido (mínimo 2 letras).',
  INVALID_EMAIL: 'Informe um email válido.',
  INVALID_PHONE_NUMBER: 'Informe um número de celular válido com DDD.',
  WEAK_PASSWORD:
    'A senha precisa ter ao menos 8 caracteres, 1 letra maiúscula e 1 caractere especial.',
  EMAIL_ALREADY_REGISTERED: 'Este email já está cadastrado.',
  WHATSAPP_ALREADY_VERIFIED: 'Este WhatsApp já está em uso por outra conta.',
  INVALID_CREDENTIALS: 'Email ou senha incorretos.',
  ACCOUNT_NOT_VERIFIED:
    'Sua conta ainda não foi verificada. Confirme seu email e WhatsApp para entrar.',
  ACCOUNT_SUSPENDED: 'Sua conta está suspensa. Entre em contato com o suporte.',
  INVALID_REFRESH_TOKEN: 'Sua sessão expirou. Entre novamente.',
  REFRESH_TOKEN_REUSED: 'Por segurança, sua sessão foi encerrada. Entre novamente.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
  INSUFFICIENT_ROLE: 'Você não tem permissão para esta ação.',
  CSRF_TOKEN_INVALID: 'Não foi possível concluir. Recarregue a página.',
  ORIGIN_NOT_ALLOWED: 'Acesso não permitido a partir deste endereço.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde alguns instantes.',
  NOT_FOUND: 'Recurso não encontrado.',
  INTERNAL_ERROR: 'Ocorreu um erro inesperado. Tente novamente.',
  NETWORK_ERROR: 'Sem conexão com o servidor',
  VALIDATION_ERROR: 'Verifique os campos e tente novamente.',
  CONFLICT: 'Já existe um cadastro com esse nome.',
  VACCINE_NAME_ALREADY_EXISTS: 'Já existe uma vacina com esse nome.',
  ANIMAL_TYPE_NAME_ALREADY_EXISTS: 'Já existe um tipo de animal com esse nome.',
  ANIMAL_CODE_ALREADY_EXISTS: 'Já existe um animal com este código nesta fazenda.',
  DUPLICATE_ANIMAL_CODE: 'Já existe um animal com este código nesta fazenda.',
  CODE_ALREADY_EXISTS: 'Já existe um animal com este código nesta fazenda.',
  FARM_HAS_ANIMALS: 'Não é possível excluir: há animais vinculados a esta fazenda.',
  ANIMAL_TYPE_HAS_ANIMALS: 'Não é possível excluir: há animais vinculados a este tipo.',
  FARM_IN_USE: 'Não é possível excluir: há animais vinculados a esta fazenda.',
  ANIMAL_TYPE_IN_USE: 'Não é possível excluir: há animais vinculados a este tipo.',
  RESOURCE_IN_USE: 'Não é possível excluir: este registro está em uso.',
  FARM_NOT_FOUND: 'Fazenda não encontrada.',
  ANIMAL_TYPE_NOT_FOUND: 'Tipo de animal não encontrado.',
  ANIMAL_NOT_FOUND: 'Animal não encontrado.',
  VACCINE_NOT_FOUND: 'Vacina não encontrada.',
  INVALID_ID: 'Identificador inválido.',
  FARM_OWNER_REQUIRED: 'Informe o usuário master dono da fazenda.',
  INVALID_FARM_OWNER: 'O dono da fazenda deve ser um usuário master ativo.',
  FARM_OWNER_FORBIDDEN: 'Você só pode cadastrar fazendas na sua própria conta.',
  INVALID_FARM_NAME: 'Informe um nome de fazenda válido (2 a 150 caracteres).',
  INVALID_FARM_CITY: 'Informe uma cidade válida (2 a 100 caracteres).',
  INVALID_STATE: 'Selecione um estado (UF) válido.',
  INVALID_VACCINE_NAME: 'Informe um nome de vacina válido (2 a 150 caracteres).',
  INVALID_WITHDRAWAL_DAYS: 'Informe os dias de carência entre 0 e 3650.',
  INVALID_ANIMAL_TYPE_NAME: 'Informe um nome de tipo válido (2 a 60 caracteres).',
  INVALID_ANIMAL_CODE: 'Informe um código ou brinco válido (até 50 caracteres).',
  INVALID_ANIMAL_SEX: 'Selecione o sexo (Macho ou Fêmea).',
  INVALID_ANIMAL_BREED: 'A raça deve ter no máximo 100 caracteres.',
  INVALID_BIRTH_DATE: 'Informe uma data de nascimento entre 01/01/1900 e hoje.',
  VACCINE_HAS_APPLICATIONS: 'Esta vacina possui lançamentos e não pode ser excluída.',
  VACCINATION_NOT_FOUND: 'Lançamento de vacina não encontrado. Ele pode ter sido excluído.',
  ANIMAL_HAS_VACCINATIONS: 'Este animal possui vacinas lançadas e não pode ser excluído.',
  INVALID_DATE_FILTER: 'Filtro de data inválido. Verifique a data selecionada.',
  VACCINE_APPLICATION_NOT_FOUND: 'Lançamento de vacina não encontrado.',
  INVALID_APPLIED_AT: 'Informe uma data de aplicação válida, entre 01/01/1900 e hoje (não pode ser futura).',
  INVALID_APPLICATION_DATE: 'Informe uma data de aplicação válida (não pode ser no futuro).',
  INVALID_DATE: 'Informe uma data válida.',
  // Usuários da conta (contrato provisório: USERS_CONTRACT)
  EMAIL_ALREADY_EXISTS: 'Este email já está cadastrado.',
  USER_EMAIL_ALREADY_EXISTS: 'Este email já está cadastrado.',
  USER_NOT_FOUND: 'Usuário não encontrado. Ele pode ter sido excluído.',
  LAST_MASTER: 'Não é possível excluir o último Usuário Master da conta.',
  CANNOT_DELETE_LAST_MASTER: 'Não é possível excluir o último Usuário Master da conta.',
  CANNOT_DELETE_SELF: 'Você não pode excluir o seu próprio usuário.',
  ACCOUNT_NOT_FOUND: 'Conta não encontrada. Selecione outra conta.',
  ACCOUNT_REQUIRED: 'Selecione a conta do novo usuário.',
  INVALID_USER_ROLE: 'Selecione o perfil: Usuário Master ou Usuário Basic.',
  ONLY_MASTER_CAN_OWN_BASIC_USERS: 'Selecione uma conta com um Usuário Master ativo.',
  // Sincronização (PowerSync, §19.8)
  UNKNOWN_TABLE: 'Este tipo de registro não pode ser sincronizado.',
  INVALID_OPERATION: 'Operação de sincronização inválida.',
  FARM_OWNER_IMMUTABLE: 'Não é possível trocar o dono de uma fazenda já cadastrada.',
  NO_ACCOUNT: 'Usuário sem conta (master) vinculada.',
  ID_ALREADY_EXISTS: 'Este registro já existe e não pode ser criado de novo.',
  INVALID_BATCH: 'Não foi possível ler as alterações enviadas pelo aplicativo.',
  BATCH_TOO_LARGE: 'Envie no máximo 500 alterações por vez.',
  SYNC_UNAVAILABLE: 'Não foi possível sincronizar agora. Tentaremos de novo em instantes.',
  POWERSYNC_NOT_CONFIGURED: 'A sincronização offline não está disponível no momento.',
  SYNC_NO_RESULT: 'O servidor não confirmou esta alteração.',
}

const VALIDATION_MESSAGE_MAP: [string, string][] = [
  ['name should not be empty', 'Informe seu nome.'],
  ['name must be a string', 'Informe seu nome.'],
  ['name must be shorter than or equal to 150 characters', 'O nome deve ter no máximo 150 caracteres.'],
  ['email must be an email', 'Informe um email válido.'],
  ['email must be a valid email address', 'Informe um email válido.'],
  ['email should not be empty', 'Informe seu email.'],
  ['mobilePhone should not be empty', 'Informe o celular.'],
  ['whatsAppPhone should not be empty', 'Informe o WhatsApp.'],
  ['must be shorter than or equal to 30 characters', 'Número muito longo.'],
  ['password must have at least 8 characters', 'A senha deve ter no mínimo 8 caracteres.'],
  ['password must have at most 128 characters', 'A senha deve ter no máximo 128 caracteres.'],
  ['password must contain at least one uppercase letter', 'A senha deve ter ao menos 1 letra maiúscula.'],
  [
    'password must contain at least one special character',
    'A senha deve ter ao menos 1 caractere especial (ex.: @ # ! $).',
  ],
  ['password should not be empty', 'Informe sua senha.'],
  ['role must be one of', 'Selecione o perfil: Usuário Master ou Usuário Basic.'],
  ['role should not be empty', 'Selecione o perfil: Usuário Master ou Usuário Basic.'],
  ['masterId should not be empty', 'Selecione a conta (master).'],
  ['accountId should not be empty', 'Selecione a conta.'],
  ['city should not be empty', 'Informe a cidade.'],
  ['city must be a string', 'Informe a cidade.'],
  ['state should not be empty', 'Informe o estado.'],
  ['state must be a string', 'Informe o estado.'],
  ['withdrawal_days should not be empty', 'Informe os dias de carência.'],
  ['withdrawalDays should not be empty', 'Informe os dias de carência.'],
  ['code should not be empty', 'Informe o código ou brinco.'],
  ['farm_id should not be empty', 'Selecione a fazenda.'],
  ['farmId should not be empty', 'Selecione a fazenda.'],
  ['animal_type_id should not be empty', 'Selecione o tipo de animal.'],
  ['animalTypeId should not be empty', 'Selecione o tipo de animal.'],
  ['sex should not be empty', 'Selecione o sexo.'],
  ['animalId should not be empty', 'Selecione o animal.'],
  ['vaccineId should not be empty', 'Selecione a vacina.'],
  ['appliedAt should not be empty', 'Informe a data de aplicação.'],
  ['appliedAt must be', 'Informe uma data de aplicação válida.'],
  ['appliedAt deve estar no formato', 'Informe uma data de aplicação válida.'],
]

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'status' in error &&
    typeof (error as ApiError).code === 'string' &&
    typeof (error as ApiError).status === 'number' &&
    !('isAxiosError' in error)
  )
}

function readRetryAfter(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  const record = headers as Record<string, unknown>
  const raw = record['retry-after'] ?? record['Retry-After']
  const value = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error

  const ax = error as AxiosError<Record<string, unknown>>
  if (!ax.response) {
    return { status: 0, code: 'NETWORK_ERROR' }
  }

  const { status, data, headers } = ax.response
  const body = (data ?? {}) as Record<string, unknown>
  const retryAfterSeconds = readRetryAfter(headers)

  if (status === 429) {
    return { status: 429, code: 'RATE_LIMITED', retryAfterSeconds: retryAfterSeconds ?? 60 }
  }

  if (typeof body.error === 'string' && /^[A-Z][A-Z0-9_]+$/.test(body.error)) {
    const details = body.details as Record<string, unknown> | undefined
    const field = typeof details?.field === 'string' ? details.field : undefined
    return {
      status,
      code: body.error,
      message: typeof body.message === 'string' ? body.message : undefined,
      details,
      fieldErrors: field ? { [field]: [body.error] } : undefined,
    }
  }

  if (status === 409) {
    return {
      status: 409,
      code: 'CONFLICT',
      message: typeof body.message === 'string' ? body.message : undefined,
      details:
        typeof body.details === 'object' && body.details
          ? (body.details as Record<string, unknown>)
          : undefined,
    }
  }

  if (status === 400) {
    const messages = Array.isArray(body.message)
      ? (body.message as string[])
      : [String(body.message ?? '')]
    const fieldErrors: Record<string, string[]> = {}
    for (const message of messages) {
      const extra = /^property (\S+) should not exist/.exec(message)
      const field = extra?.[1] ?? message.split(' ')[0] ?? '_'
      ;(fieldErrors[field] ??= []).push(message)
    }
    return { status: 400, code: 'VALIDATION_ERROR', fieldErrors }
  }

  if (status === 404) return { status: 404, code: 'NOT_FOUND' }
  return { status, code: 'INTERNAL_ERROR' }
}

export function messageForValidation(apiMessage: string): string | null {
  if (apiMessage.startsWith('property ') && apiMessage.includes('should not exist')) return null
  if (apiMessage.startsWith('client must be')) return null
  for (const [needle, mapped] of VALIDATION_MESSAGE_MAP) {
    if (apiMessage.includes(needle)) return mapped
  }
  return null
}

export function fieldMessagesFromError(error: ApiError): Record<string, string> {
  const out: Record<string, string> = {}
  if (!error.fieldErrors) return out
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const mapped = messages
      .map((message) => DOMAIN_MESSAGES[message] ?? messageForValidation(message))
      .filter((message): message is string => Boolean(message))
    if (mapped[0]) out[field] = mapped[0]
  }
  return out
}

export function userMessage(
  error: ApiError,
  opts?: { rateLimitContext?: 'login' | 'default' },
): string {
  if (error.code === 'RATE_LIMITED') {
    const seconds = error.retryAfterSeconds ?? 60
    if (opts?.rateLimitContext === 'login') {
      return `Muitas tentativas de login. Tente novamente em ${seconds}s.`
    }
    return `Muitas tentativas. Aguarde ${seconds}s.`
  }
  return DOMAIN_MESSAGES[error.code] ?? DOMAIN_MESSAGES.INTERNAL_ERROR
}

const PT_HINT =
  /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|\b(já|nao|não|cadastrad[oa]s?|vinculad[oa]s?|existe[m]?|animal(?:es)?|fazenda|código|codigo|brinco|carência|carencia|vacinas?|lançamentos?|obrigatório|obrigatorio|inválid[oa]|excluir)\b/i
const EN_TECHNICAL =
  /\b(already|exists|cannot|must|should|invalid|not found|conflict|duplicate|unique constraint|internal server|bad request|forbidden|unauthorized)\b/i

export function isPortugueseUserMessage(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  if (EN_TECHNICAL.test(trimmed) && !PT_HINT.test(trimmed)) return false
  return PT_HINT.test(trimmed)
}

/**
 * Códigos cuja message da API cita nomes técnicos (dateFrom/dateTo, AAAA-MM-DD):
 * a UI usa sempre o texto do app.
 */
const APP_MESSAGE_FIRST = new Set(['INVALID_DATE_FILTER', 'INVALID_APPLIED_AT'])

/** Mensagem segura para a UI: prioriza message pt-BR do corpo; senão mapeia o código. */
export function publicApiMessage(error: ApiError): string {
  if (APP_MESSAGE_FIRST.has(error.code) && DOMAIN_MESSAGES[error.code]) return DOMAIN_MESSAGES[error.code]
  if (error.message && isPortugueseUserMessage(error.message)) {
    return error.message
  }
  if (DOMAIN_MESSAGES[error.code]) return DOMAIN_MESSAGES[error.code]
  if (error.status === 409) return 'Não foi possível concluir. Este registro está em uso ou já existe.'
  if (error.status === 404) return DOMAIN_MESSAGES.NOT_FOUND
  if (error.status === 400) return DOMAIN_MESSAGES.VALIDATION_ERROR
  if (error.status === 403) return DOMAIN_MESSAGES.INSUFFICIENT_ROLE
  if (error.status === 422) return 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return DOMAIN_MESSAGES.INTERNAL_ERROR
}

export function listErrorMessage(error: ApiError): string {
  if (error.code === 'NETWORK_ERROR' || error.code === 'UNAUTHENTICATED' || error.code === 'RATE_LIMITED') {
    return userMessage(error)
  }
  if (APP_MESSAGE_FIRST.has(error.code) && DOMAIN_MESSAGES[error.code]) return DOMAIN_MESSAGES[error.code]
  if (error.message && isPortugueseUserMessage(error.message)) {
    return error.message
  }
  return 'Não foi possível carregar a lista. Tente novamente.'
}
