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
      details,
      fieldErrors: field ? { [field]: [body.error] } : undefined,
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
