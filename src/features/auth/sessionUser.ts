/**
 * Regras puras da sessão no app (testáveis no Node). Ver API_INTEGRATION.md §22.1 (401 ACCESS_TOKEN_STALE).
 */
import type { AuthUser } from '@/api/types'

/** Aviso no login quando a sessão acaba sozinha (refresh recusado). Os dados locais e a fila são mantidos. */
export const SESSION_EXPIRED_NOTICE = 'Sua sessão expirou. Entre novamente.'

/**
 * Usuário em memória depois de um refresh bem-sucedido. O refresh relê papel e conta (ACCESS_TOKEN_STALE com
 * role_changed/account_changed): atualiza o usuário atual se for a MESMA pessoa e algo mudou. Devolve `current`
 * (mesma referência) quando nada muda, para não re-renderizar à toa; outro id (não deveria acontecer) é ignorado.
 */
export function applyRefreshedUser(current: AuthUser | null, fresh: AuthUser | null | undefined): AuthUser | null {
  if (!current || !fresh || fresh.id !== current.id) return current
  const same =
    fresh.role === current.role &&
    (fresh.accountId ?? null) === (current.accountId ?? null) &&
    (fresh.masterUserId ?? null) === (current.masterUserId ?? null) &&
    fresh.name === current.name &&
    fresh.email === current.email
  return same ? current : fresh
}
