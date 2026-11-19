/**
 * Vacinas por conta (API_INTEGRATION.md §25). Regras puras, sem React Native (testáveis no Node).
 *
 * - Unicidade: nome único POR CONTA, sem maiúsculas NEM acentos (`f_unaccent(lower(name))`, §25.1). O servidor é a
 *   fonte da verdade; a checagem local só evita a Pendência óbvia.
 * - `account_id` (coluna da tabela local `vaccines`) vem do servidor e nunca sobe (NEVER_UPLOAD_COLUMNS). Linhas
 *   ainda sem `account_id` (baixadas antes da regra nova, até o re-download do bucket) contam como "da conta": não
 *   somem do seletor no campo; se o id for do catálogo antigo, o servidor remapeia (§25.5) ou recusa com Pendência.
 */
import type { UserRole } from '@/api/types'

/** Comparação de nome igual à do servidor: sem acentos, sem maiúsculas, espaços normalizados. */
export function foldVaccineName(name: unknown): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toUpperCase() === b.toUpperCase()

/** Vacina pertence à conta? Sem `accountId` (linha antiga) conta como da conta (ver topo). */
export function isVaccineOfAccount(vaccine: { accountId?: string | null }, accountId: string | null | undefined): boolean {
  if (!accountId) return false
  return !vaccine.accountId || sameId(vaccine.accountId, accountId)
}

/** Nome já usado por OUTRA vacina da mesma conta. */
export function isVaccineNameTaken(
  name: string,
  vaccines: { id: string; name: string; accountId?: string | null }[],
  accountId: string | null | undefined,
  excludeId?: string,
): boolean {
  const folded = foldVaccineName(name)
  if (!folded) return false
  return vaccines.some(
    (v) => !sameId(v.id, excludeId) && (accountId ? isVaccineOfAccount(v, accountId) : true) && foldVaccineName(v.name) === folded,
  )
}

/**
 * Conta cujas vacinas o seletor do lançamento mostra (§25.4: vacina e animal da MESMA conta):
 * - com animal escolhido: a conta da fazenda do animal (vale para o admin, que lança em qualquer conta);
 * - sem animal: master/básico → a própria conta; admin → nenhuma (escolha o animal primeiro).
 */
export function vaccinePickerAccountId(input: {
  role: UserRole | null | undefined
  userAccountId: string | null | undefined
  animalAccountId: string | null | undefined
}): string | null {
  if (input.animalAccountId) return input.animalAccountId
  if (input.role === 'admin') return null
  return input.userAccountId ?? null
}

export function filterVaccinesForAccount<T extends { accountId?: string | null }>(vaccines: T[], accountId: string | null): T[] {
  return accountId ? vaccines.filter((v) => isVaccineOfAccount(v, accountId)) : []
}

export const VACCINE_PICKER_MESSAGES = {
  chooseAnimalFirst: 'Escolha o animal primeiro: a lista mostra os medicamentos da conta dele.',
  wrongAccount: 'Escolha um medicamento da conta do animal.',
  noneInAccount: 'Esta conta ainda não tem medicamentos cadastrados.',
} as const
