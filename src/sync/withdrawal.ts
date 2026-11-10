/**
 * Regras de carência calculadas localmente (offline), iguais às da API (§18):
 * - withdrawalUntil = appliedAt + withdrawalDays (sem +1).
 * - Aplicação ativa enquanto hoje < withdrawalUntil (no próprio dia o animal já está livre).
 * - freeAt = maior withdrawalUntil; inWithdrawal = hoje < freeAt.
 * - totalWithdrawalDays = soma de TODAS as aplicações (inclusive vencidas) — só informativo.
 * Puro (sem React Native) para testes no Node.
 */
import { addDaysIso } from '../components/form/date'

export function computeWithdrawalUntil(appliedAt: string, withdrawalDays: number): string {
  return addDaysIso(appliedAt, withdrawalDays)
}

export function isActiveOn(withdrawalUntil: string | null | undefined, today: string): boolean {
  return Boolean(withdrawalUntil) && today < (withdrawalUntil as string)
}

export type ApplicationLike = { withdrawalDays: number; withdrawalUntil: string }

export function summarizeWithdrawal(applications: ApplicationLike[], today: string) {
  let total = 0
  let freeAt: string | null = null
  for (const item of applications) {
    total += Number(item.withdrawalDays) || 0
    if (item.withdrawalUntil && (freeAt == null || item.withdrawalUntil > freeAt)) freeAt = item.withdrawalUntil
  }
  return { totalWithdrawalDays: total, freeAt, inWithdrawal: isActiveOn(freeAt, today) }
}
