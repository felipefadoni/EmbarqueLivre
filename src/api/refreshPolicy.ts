/**
 * Quando um 401 pode disparar refresh + repetir a chamada. Puro (testável no Node).
 * - Só 401: 403 (ex.: INVALID_CURRENT_PASSWORD, ADMIN_SELF_DELETION_FORBIDDEN) nunca renova sessão nem desloga.
 * - Rotas de autenticação não repetem (evita laço refresh -> 401 -> refresh).
 * - POST /auth/me/deletion não é repetido: é destrutivo e leva a senha; repetir em silêncio após um refresh
 *   esconderia do usuário que a sessão mudou. O 401 ali vira "sessão terminou" na tela.
 * - GET /auth/me/deletion-preview pode renovar normalmente (access token expirado é caso comum).
 */
const AUTH_CALLS = ['/auth/login', '/auth/refresh', '/auth/logout']
const NO_REPLAY = [/\/auth\/me\/deletion\/?$/]

export function canRefreshAndReplay(input: { status: number | undefined; url: string | undefined; alreadyRetried: boolean }): boolean {
  if (input.status !== 401 || input.alreadyRetried) return false
  const path = (input.url ?? '').split('?')[0]
  if (AUTH_CALLS.some((call) => path.includes(call))) return false
  if (NO_REPLAY.some((pattern) => pattern.test(path))) return false
  return true
}
