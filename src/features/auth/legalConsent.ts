/**
 * Aceite dos Termos de Uso + Política de Privacidade no cadastro (LGPD). Lógica pura (sem React/RN), testável.
 *
 * Contrato (embarquelivre-api, identity/legal):
 * - GET /api/v1/legal/current (público) → { termsVersion, privacyVersion, termsUrl|null, privacyUrl|null, acceptanceRequired }
 * - POST /api/v1/users aceita { acceptTerms, termsVersion, privacyVersion } (opcionais no transporte). Regras, nesta ordem:
 *   acceptTerms=false → 400 TERMS_NOT_ACCEPTED (sempre); nada enviado + acceptanceRequired=false → cadastro aceito SEM
 *   registro de aceite (só para o app antigo); caso contrário acceptTerms=true e as duas versões iguais às vigentes
 *   (ausente = mismatch) → senão TERMS_NOT_ACCEPTED / TERMS_VERSION_MISMATCH / PRIVACY_VERSION_MISMATCH
 *   (details.currentVersion).
 *
 * Decisão do app: SEMPRE exige o checkbox e SEMPRE envia os 3 campos, mesmo com acceptanceRequired=false. A flag só
 * existe para não quebrar o app antigo; enviar o aceite faz o servidor validar e GRAVAR a evidência (versões, data,
 * IP, User-Agent). Sem /legal/current carregado não há versões para enviar, então o cadastro fica bloqueado
 * (o cadastro já exige internet).
 */
import type { ApiError } from '@/api/types'

export interface CurrentLegal {
  termsVersion: string
  privacyVersion: string
  /** null = documento sem URL publicada (não mostrar link quebrado). */
  termsUrl: string | null
  privacyUrl: string | null
  acceptanceRequired: boolean
}

export interface SignupConsentFields {
  acceptTerms: true
  termsVersion: string
  privacyVersion: string
}

export type LegalLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; legal: CurrentLegal }

export const CONSENT_LABEL = 'Li e aceito os Termos de Uso e a Política de Privacidade'

export const CONSENT_MESSAGES = {
  TERMS_NOT_ACCEPTED: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.',
  TERMS_VERSION_MISMATCH: 'Os Termos de Uso foram atualizados. Leia a nova versão e aceite novamente.',
  PRIVACY_VERSION_MISMATCH: 'A Política de Privacidade foi atualizada. Leia a nova versão e aceite novamente.',
} as const

const VERSION_MAX = 32
const isHttpUrl = (value: unknown): value is string => typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim())
const isVersion = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= VERSION_MAX

/** Valida a resposta do /legal/current. null = resposta inesperada (tratar como falha de carregamento). */
export function parseCurrentLegal(data: unknown): CurrentLegal | null {
  if (!data || typeof data !== 'object') return null
  const body = data as Record<string, unknown>
  if (!isVersion(body.termsVersion) || !isVersion(body.privacyVersion)) return null
  return {
    termsVersion: body.termsVersion.trim(),
    privacyVersion: body.privacyVersion.trim(),
    termsUrl: isHttpUrl(body.termsUrl) ? body.termsUrl.trim() : null,
    privacyUrl: isHttpUrl(body.privacyUrl) ? body.privacyUrl.trim() : null,
    acceptanceRequired: body.acceptanceRequired === true,
  }
}

/** Campos do aceite para o POST /users. null = não pode cadastrar (sem /legal/current ou caixa desmarcada). */
export function buildSignupConsent(state: LegalLoadState, accepted: boolean): SignupConsentFields | null {
  if (state.status !== 'ready' || !accepted) return null
  return { acceptTerms: true, termsVersion: state.legal.termsVersion, privacyVersion: state.legal.privacyVersion }
}

/** Por que o botão Cadastrar está desabilitado por causa do aceite (null = liberado). */
export function consentBlockReason(state: LegalLoadState, accepted: boolean): string | null {
  if (state.status === 'loading') return 'Carregando os Termos de Uso e a Política de Privacidade…'
  if (state.status === 'error') return 'Para criar a conta, é preciso carregar os Termos de Uso e a Política de Privacidade.'
  if (!accepted) return 'Para criar a conta, marque a caixa acima aceitando os Termos de Uso e a Política de Privacidade.'
  return null
}

export type ConsentErrorAction =
  /** Caixa desmarcada/aceite ausente: só mostrar a mensagem. */
  | { kind: 'not-accepted'; message: string }
  /** Texto mudou no servidor: recarregar /legal/current, DESMARCAR a caixa e pedir o aceite de novo (não reenviar sozinho). */
  | { kind: 'version-changed'; message: string }

/** Como a tela reage a um erro do POST /users relacionado ao aceite. null = não é erro de aceite. */
export function consentErrorAction(error: Pick<ApiError, 'code'>): ConsentErrorAction | null {
  switch (error.code) {
    case 'TERMS_NOT_ACCEPTED':
      return { kind: 'not-accepted', message: CONSENT_MESSAGES.TERMS_NOT_ACCEPTED }
    case 'TERMS_VERSION_MISMATCH':
      return { kind: 'version-changed', message: CONSENT_MESSAGES.TERMS_VERSION_MISMATCH }
    case 'PRIVACY_VERSION_MISMATCH':
      return { kind: 'version-changed', message: CONSENT_MESSAGES.PRIVACY_VERSION_MISMATCH }
    default:
      return null
  }
}

/** Mensagem da falha ao carregar o /legal/current. */
export function legalLoadErrorMessage(error: Pick<ApiError, 'code' | 'status'> | null): string {
  if (error?.code === 'NETWORK_ERROR' || error?.status === 0) {
    return 'Sem conexão com a internet. O cadastro precisa de internet para carregar os Termos de Uso e a Política de Privacidade. Conecte-se e toque em “Tentar novamente”.'
  }
  if (error?.code === 'RATE_LIMITED') return 'Muitas tentativas. Aguarde alguns instantes e toque em “Tentar novamente”.'
  return 'Não foi possível carregar os Termos de Uso e a Política de Privacidade. Toque em “Tentar novamente”.'
}
