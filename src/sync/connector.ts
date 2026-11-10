import type { CommonPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/common'

import { http } from '@/api/client'
import { isApiError, publicApiMessage } from '@/api/errors'
import { POWERSYNC_CONFIG } from './config'
import { newUlid } from './ids'
import { parseTimestamp } from './mapping'
import { saveRejections } from './rejections'
import { SessionEndedUploadError, resolvePowerSyncEndpoint, uploadTransaction, type PostResponse } from './upload'

type TokenResponse = { token: string; powersyncUrl?: string; expiresAt?: string }

/**
 * Connector do PowerSync.
 * - fetchCredentials: GET /powersync/token com o Bearer do app (o cliente http já faz refresh
 *   single-flight). Cache local renovado antes de expirar (TTL do servidor = 5 min / 300 s; renovado 1 min antes).
 * - uploadData: próxima transação da fila → POST /powersync/upload em lotes de até 500.
 *   Recusas vão para `sync_rejections`; 408/429/5xx/sem rede lançam para o SDK tentar de novo. 401 UNAUTHENTICATED encerra a sessão (sem retry) e mantém os dados locais.
 */
export class EmbarqueConnector implements PowerSyncBackendConnector {
  private cached: PowerSyncCredentials | null = null
  onSessionEnded: () => void | Promise<void> = () => {}

  invalidate() {
    this.cached = null
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const cached = this.cached
    if (cached?.expiresAt && cached.expiresAt.getTime() - Date.now() > POWERSYNC_CONFIG.tokenRenewMarginMs) {
      return cached
    }
    // Lança em erro de rede/servidor: o SDK reconecta com backoff (inclusive 503 POWERSYNC_NOT_CONFIGURED,
    // servidor sem chave). A mensagem pt-BR aparece no status de sincronização.
    let data: TokenResponse
    try {
      data = (await http.get<TokenResponse>(POWERSYNC_CONFIG.tokenPath)).data
    } catch (error) {
      if (isApiError(error) && error.code === 'POWERSYNC_NOT_CONFIGURED') {
        console.warn('[sync] /powersync/token: POWERSYNC_NOT_CONFIGURED (rode pnpm powersync:keygen na API)')
        throw new Error(publicApiMessage(error))
      }
      throw error
    }
    const endpoint = resolvePowerSyncEndpoint(POWERSYNC_CONFIG.url, data.powersyncUrl)
    if (!data.token || !endpoint) throw new Error('Resposta inválida de /powersync/token (token ou URL ausente).')
    this.cached = {
      endpoint,
      token: data.token,
      // ISO UTC (às vezes com microssegundos): normalizado e truncado em ms antes do new Date (Hermes).
      expiresAt: parseTimestamp(data.expiresAt) ?? new Date(Date.now() + 10 * 60_000),
    }
    return this.cached
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) return
    try {
      await uploadTransaction(transaction, {
        post: postBatch,
        saveRejections: (rows) => saveRejections(database, rows, newUlid),
      })
    } catch (error) {
      if (error instanceof SessionEndedUploadError) {
        await this.onSessionEnded()
        return
      }
      throw error
    }
  }
}

async function postBatch(body: unknown): Promise<PostResponse> {
  try {
    const response = await http.post(POWERSYNC_CONFIG.uploadPath, body, { timeout: 60_000 })
    return { status: response.status, data: response.data }
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 0) throw error // sem rede: upload.ts transforma em erro de retry
      return { status: error.status, data: { statusCode: error.status, error: error.code, message: error.message } }
    }
    throw error
  }
}
