/**
 * Validação local do cadastro de vacina (offline: nada depende da rede). Mesmas regras de antes, extraídas do
 * VaccineEditor para teste. Limites conferidos na API (main): nome varchar(150) não vazio (app exige 2+), carência
 * inteira 0..3650 (WithdrawalDays.MAX).
 */
import type { VaccinePayload } from '@/api/catalog'

import { LIMITS } from './limits'

export type VaccineFormValues = { name: string; withdrawalDays: string }
export type VaccineFormErrors = Partial<Record<keyof VaccineFormValues, string>>

export const VACCINE_FORM_MESSAGES = {
  nameRequired: 'Informe o nome da vacina.',
  nameLength: `O nome deve ter entre ${LIMITS.vaccineName.min} e ${LIMITS.vaccineName.max} caracteres.`,
  daysRequired: 'Informe os dias de carência.',
  daysInteger: `Informe um número inteiro entre ${LIMITS.withdrawalDays.min} e ${LIMITS.withdrawalDays.max}.`,
  daysRange: `Informe os dias de carência entre ${LIMITS.withdrawalDays.min} e ${LIMITS.withdrawalDays.max}.`,
} as const

/** Só dígitos no campo de carência (teclado numérico ainda deixa colar texto). */
export function sanitizeWithdrawalDays(value: string): string {
  return value.replace(/[^\d]/g, '')
}

export function validateVaccineForm(values: VaccineFormValues): { errors: VaccineFormErrors; payload: VaccinePayload | null } {
  const errors: VaccineFormErrors = {}
  const name = values.name.trim()
  if (!name) errors.name = VACCINE_FORM_MESSAGES.nameRequired
  else if (name.length < LIMITS.vaccineName.min || name.length > LIMITS.vaccineName.max) errors.name = VACCINE_FORM_MESSAGES.nameLength
  const daysText = values.withdrawalDays.trim()
  if (!daysText) errors.withdrawalDays = VACCINE_FORM_MESSAGES.daysRequired
  else if (!/^\d+$/.test(daysText)) errors.withdrawalDays = VACCINE_FORM_MESSAGES.daysInteger
  else {
    const days = Number(daysText)
    if (days < LIMITS.withdrawalDays.min || days > LIMITS.withdrawalDays.max) errors.withdrawalDays = VACCINE_FORM_MESSAGES.daysRange
  }
  if (Object.keys(errors).length) return { errors, payload: null }
  return { errors, payload: { name, withdrawalDays: Number(daysText) } }
}
