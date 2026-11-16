import { parseCurrentLegal, type CurrentLegal } from '@/features/auth/legalConsent'
import { parseAcceptanceResult, parseLegalStatus, type LegalStatus } from '@/features/auth/legalReacceptance'

import { http } from './client'
import type { ApiError } from './types'

/** GET /api/v1/legal/current (público). Resposta fora do contrato vira erro (a tela mostra "Tentar novamente"). */
export async function fetchCurrentLegal(): Promise<CurrentLegal> {
  const { data } = await http.get<unknown>('/legal/current')
  const legal = parseCurrentLegal(data)
  if (!legal) {
    const error: ApiError = { status: 200, code: 'INVALID_LEGAL_RESPONSE' }
    throw error
  }
  return legal
}

function invalidLegalResponse(): ApiError {
  return { status: 200, code: 'INVALID_LEGAL_RESPONSE' }
}

/** GET /api/v1/legal/status (autenticado): estado do aceite do usuário (§6.11.1). */
export async function fetchLegalStatus(): Promise<LegalStatus> {
  const { data } = await http.get<unknown>('/legal/status')
  const status = parseLegalStatus(data)
  if (!status) throw invalidLegalResponse()
  return status
}

/** POST /api/v1/legal/acceptance com as DUAS versões que o usuário viu (§6.11.2). Idempotente. */
export async function acceptLegal(versions: { termsVersion: string; privacyVersion: string }) {
  const { data } = await http.post<unknown>('/legal/acceptance', versions)
  const result = parseAcceptanceResult(data)
  if (!result) throw invalidLegalResponse()
  return result
}
