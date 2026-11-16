import { parseCurrentLegal, type CurrentLegal } from '@/features/auth/legalConsent'

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
