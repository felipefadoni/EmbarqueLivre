/**
 * Re-aceite de Termos/Política para quem já tem conta (API_INTEGRATION.md §6.11). Lógica pura, testável no Node.
 *
 * Contrato:
 * - GET /api/v1/legal/status (autenticado, no-store) e o bloco `legal` do GET /auth/me:
 *   { termsVersion, privacyVersion, termsUrl, privacyUrl, termsAccepted, privacyAccepted, acceptanceRequired,
 *     termsAcceptedAt|null, privacyAcceptedAt|null }. Admin: acceptanceRequired sempre false.
 * - POST /api/v1/legal/acceptance { termsVersion, privacyVersion } (as DUAS versões vistas) -> 200 { recorded, legal }.
 *   Idempotente (já aceito -> recorded=false). 400 TERMS_VERSION_MISMATCH / PRIVACY_VERSION_MISMATCH (versão mudou com
 *   a tela aberta: recarregar e pedir de novo). Nada é gravado em erro.
 * - A API NÃO bloqueia nenhuma rota (o 403 LEGAL_ACCEPTANCE_REQUIRED é só proposta, §6.11.3): quem mostra a tela é o app.
 *
 * Decisão offline: a tela só aparece com um estado lido do servidor NESTA sessão e com internet. Sem internet o trabalho
 * de campo segue (a API não exige o aceite nem para sync/upload, e aceitar precisa de internet de qualquer jeito). Quando
 * a internet volta, o app consulta /legal/status e bloqueia se ainda faltar o aceite. Dados locais e fila não são tocados.
 */
import type { ApiError } from '@/api/types'

export interface LegalStatus {
  termsVersion: string
  privacyVersion: string
  termsUrl: string | null
  privacyUrl: string | null
  termsAccepted: boolean
  privacyAccepted: boolean
  acceptanceRequired: boolean
}

const VERSION_MAX = 32
const isVersion = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= VERSION_MAX
const httpUrl = (value: unknown) => (typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) ? value.trim() : null)

/** Valida o bloco `legal`. null = fora do contrato (não bloqueia o usuário por resposta estranha; tenta de novo depois). */
export function parseLegalStatus(data: unknown): LegalStatus | null {
  if (!data || typeof data !== 'object') return null
  const body = data as Record<string, unknown>
  if (!isVersion(body.termsVersion) || !isVersion(body.privacyVersion)) return null
  if (typeof body.acceptanceRequired !== 'boolean') return null
  return {
    termsVersion: body.termsVersion.trim(),
    privacyVersion: body.privacyVersion.trim(),
    termsUrl: httpUrl(body.termsUrl),
    privacyUrl: httpUrl(body.privacyUrl),
    termsAccepted: body.termsAccepted === true,
    privacyAccepted: body.privacyAccepted === true,
    acceptanceRequired: body.acceptanceRequired,
  }
}

/** Resposta do POST /legal/acceptance. */
export function parseAcceptanceResult(data: unknown): { recorded: boolean; legal: LegalStatus } | null {
  if (!data || typeof data !== 'object') return null
  const body = data as Record<string, unknown>
  const legal = parseLegalStatus(body.legal)
  return legal ? { recorded: body.recorded === true, legal } : null
}

/** Falta aceitar? Admin nunca é cobrado (a API já manda false; conferido de novo aqui). */
export function isReacceptancePending(status: LegalStatus | null, role: string | null | undefined): boolean {
  return !!status && status.acceptanceRequired && role !== 'admin'
}

/** A tela bloqueante só aparece online (ver decisão offline no topo). */
export function isReacceptanceGateVisible(input: { pending: boolean; online: boolean }): boolean {
  return input.pending && input.online
}

/**
 * Quando consultar /legal/status: nunca consultado; falhou antes (de novo só depois de uma espera, para não martelar a
 * API); ou o app voltou ao primeiro plano/à internet depois de um tempo (a versão pode mudar com o app aberto).
 */
export const LEGAL_RECHECK_MS = 30 * 60_000
export const LEGAL_RETRY_AFTER_FAILURE_MS = 15_000

export function shouldCheckLegalStatus(input: {
  authenticated: boolean
  online: boolean
  inFlight: boolean
  lastCheckedAt: number | null
  lastFailed: boolean
  now: number
}): boolean {
  if (!input.authenticated || !input.online || input.inFlight) return false
  if (input.lastCheckedAt == null) return true
  const elapsed = input.now - input.lastCheckedAt
  return elapsed >= (input.lastFailed ? LEGAL_RETRY_AFTER_FAILURE_MS : LEGAL_RECHECK_MS)
}

export type ReacceptanceCopy = { title: string; message: string; showTermsLink: boolean; showPrivacyLink: boolean }

/** Textos da tela conforme o que mudou. */
export function reacceptanceCopy(status: LegalStatus): ReacceptanceCopy {
  const terms = !status.termsAccepted
  const privacy = !status.privacyAccepted
  if (terms && privacy) {
    return {
      title: 'Atualizamos os Termos de Uso e a Política de Privacidade',
      message: 'Para continuar usando o Embarque Livre, leia os documentos e toque em “Aceitar”.',
      showTermsLink: true,
      showPrivacyLink: true,
    }
  }
  if (terms) {
    return {
      title: 'Atualizamos os Termos de Uso',
      message: 'Para continuar usando o Embarque Livre, leia os Termos de Uso e toque em “Aceitar”.',
      showTermsLink: true,
      showPrivacyLink: false,
    }
  }
  return {
    title: 'Atualizamos a Política de Privacidade',
    message: 'Para continuar usando o Embarque Livre, leia a Política de Privacidade e toque em “Aceitar”.',
    showTermsLink: false,
    showPrivacyLink: true,
  }
}

export const REACCEPT_MESSAGES = {
  versionChanged: 'O documento foi atualizado de novo enquanto a tela estava aberta. Leia a versão nova e toque em “Aceitar”.',
  offline: 'Sem conexão com a internet. Conecte-se e toque em “Aceitar” de novo.',
  rateLimited: 'Muitas tentativas. Aguarde alguns instantes e toque em “Aceitar” de novo.',
  unknown: 'Não foi possível registrar o aceite agora. Tente de novo em instantes.',
} as const

export type AcceptanceErrorAction =
  /** Versão mudou no servidor: recarregar /legal/status e pedir o aceite de novo (sem reenviar sozinho). */
  | { kind: 'reload'; message: string }
  | { kind: 'retry'; message: string }
  /** 401: o interceptor já tentou o refresh; se falhou, o AuthProvider manda para o login. */
  | { kind: 'session'; message: string }

export function acceptanceErrorAction(error: Pick<ApiError, 'code' | 'status'>): AcceptanceErrorAction {
  if (error.code === 'TERMS_VERSION_MISMATCH' || error.code === 'PRIVACY_VERSION_MISMATCH') {
    return { kind: 'reload', message: REACCEPT_MESSAGES.versionChanged }
  }
  if (error.status === 401) return { kind: 'session', message: 'Sua sessão expirou. Entre novamente.' }
  if (error.code === 'NETWORK_ERROR' || error.status === 0) return { kind: 'retry', message: REACCEPT_MESSAGES.offline }
  if (error.status === 429) return { kind: 'retry', message: REACCEPT_MESSAGES.rateLimited }
  return { kind: 'retry', message: REACCEPT_MESSAGES.unknown }
}
