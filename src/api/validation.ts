import { parsePhoneNumber } from 'libphonenumber-js/max'

/** Regras de senha iguais às da API (§6.1). A senha nunca é aparada. */
export const passwordRules = {
  min: (password: string) => password.length >= 8,
  max: (password: string) => password.length <= 128,
  upper: (password: string) => /\p{Lu}/u.test(password),
  special: (password: string) => /[^\p{L}\p{N}\s]/u.test(password),
}

export function passwordIsValid(password: string): boolean {
  return (
    passwordRules.min(password) &&
    passwordRules.max(password) &&
    passwordRules.upper(password) &&
    passwordRules.special(password)
  )
}

export function nameIsValid(name: string): boolean {
  const value = name.normalize('NFC').trim().replace(/\s+/g, ' ')
  return value.length >= 2 && value.length <= 150 && /\p{L}/u.test(value)
}

export function emailIsValid(raw: string): boolean {
  const email = raw.trim().toLowerCase()
  if (email.length === 0 || email.length > 254) return false
  const at = email.lastIndexOf('@')
  if (at <= 0) return false
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length === 0 || local.length > 64 || domain.length === 0) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const MOBILE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE'])

/** Normaliza para dígitos (com + se o usuário informou DDI) antes de validar. */
function phoneDigits(value: string): string {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

export function mobilePhoneIsValid(value: string): boolean {
  try {
    const parsed = parsePhoneNumber(phoneDigits(value), 'BR')
    return parsed?.isValid() === true && MOBILE_TYPES.has(parsed.getType() ?? '')
  } catch {
    return false
  }
}

/** Máscara amigável para celular BR: (11) 91234-5678, preservando +55 se digitado. */
export function maskPhoneBR(value: string): string {
  const hasPlus = value.trim().startsWith('+')
  const digits = value.replace(/\D/g, '')

  if (hasPlus || (digits.startsWith('55') && digits.length > 11)) {
    const rest = digits.startsWith('55') ? digits.slice(2, 13) : digits.slice(0, 11)
    if (rest.length === 0) return '+55 '
    if (rest.length <= 2) return `+55 (${rest}`
    if (rest.length <= 7) return `+55 (${rest.slice(0, 2)}) ${rest.slice(2)}`
    return `+55 (${rest.slice(0, 2)}) ${rest.slice(2, 7)}-${rest.slice(7, 11)}`
  }

  const local = digits.slice(0, 11)
  if (local.length === 0) return ''
  if (local.length <= 2) return `(${local}`
  if (local.length <= 7) return `(${local.slice(0, 2)}) ${local.slice(2)}`
  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
}

/** Mensagens iguais às do cadastro (src/app/(auth)/cadastro.tsx). */
export const PHONE_MESSAGES = {
  mobileRequired: 'Informe o celular.',
  whatsAppRequired: 'Informe o WhatsApp.',
  invalid: 'Informe um número de celular válido com DDD.',
} as const

/**
 * Valida celular e WhatsApp com as mesmas regras do signup.
 * `sameWhatsApp` verdadeiro: o WhatsApp reutiliza o celular e não é validado à parte.
 */
export function validatePhoneFields(input: {
  mobilePhone: string
  whatsAppPhone: string
  sameWhatsApp: boolean
}): Record<string, string> {
  const next: Record<string, string> = {}
  if (!input.mobilePhone.trim()) next.mobilePhone = PHONE_MESSAGES.mobileRequired
  else if (!mobilePhoneIsValid(input.mobilePhone)) next.mobilePhone = PHONE_MESSAGES.invalid
  if (!input.sameWhatsApp) {
    if (!input.whatsAppPhone.trim()) next.whatsAppPhone = PHONE_MESSAGES.whatsAppRequired
    else if (!mobilePhoneIsValid(input.whatsAppPhone)) next.whatsAppPhone = PHONE_MESSAGES.invalid
  }
  return next
}

/** WhatsApp efetivo do payload: o celular, se for o mesmo número. */
export function resolvedWhatsAppPhone(mobilePhone: string, whatsAppPhone: string, sameWhatsApp: boolean): string {
  return sameWhatsApp ? mobilePhone : whatsAppPhone
}

/** Compara só os dígitos; WhatsApp ausente conta como o mesmo número (switch ligado). */
export function sameWhatsAppAsMobile(mobilePhone: string, whatsAppPhone: string | null | undefined): boolean {
  if (!whatsAppPhone || !whatsAppPhone.trim()) return true
  return mobilePhone.replace(/\D/g, '') === whatsAppPhone.replace(/\D/g, '')
}

