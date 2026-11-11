import type { CommonPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/common'

import { http } from '@/api/client'
import { isApiError, publicApiMessage } from '@/api/errors'
import { localFileExists, uploadShipmentPhoto } from '@/api/shipmentPhotos'
import { POWERSYNC_CONFIG } from './config'
import { newUlid } from './ids'
import { parseTimestamp, tableOf } from './mapping'
import { applyIdMap, applyRemaps, loadIdMap, markSent, parkOps } from './localGuard'
import { flushOutbox, requeueDeliveryFailures, retryDueConflicts } from './outbox'
import { ensurePhotosUploaded } from './photoQueue'
import { saveRejections } from './rejections'
import { isEnvironmentMismatchError, SessionEndedUploadError, resolvePowerSyncEndpoint, uploadTransaction, withAnimalTypeName, type PostResponse } from './upload'

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
  /**
   * Erro do último envio (null = deu certo). Lido pelo envio direto/indicador para a falha aparecer na tela em vez de
   * ficar só no retry silencioso do SDK.
   */
  lastError: unknown = null
  onSessionEnded: () => void | Promise<void> = () => {}

  /**
   * API e PowerSync em ambientes diferentes (ver resolvePowerSyncEndpoint): mensagem para o indicador; null = ok.
   * Com isso o download fica pausado (não conecta) e o envio direto à API continua (uploadPump).
   */
  environmentMismatch: string | null = null
  private mismatchListeners = new Set<() => void>()

  subscribeMismatch = (listener: () => void) => {
    this.mismatchListeners.add(listener)
    return () => void this.mismatchListeners.delete(listener)
  }

  getMismatch = () => this.environmentMismatch

  private setMismatch(message: string | null) {
    if (this.environmentMismatch === message) return
    this.environmentMismatch = message
    for (const listener of this.mismatchListeners) listener()
  }

  /**
   * Antes de conectar o PowerSync: confere se o endpoint do download é do mesmo ambiente da API. false = NÃO conectar
   * (aviso no indicador, sem exceção). Outras falhas (sem rede, 5xx) devolvem true: o SDK conecta e tenta de novo.
   */
  async canConnect(): Promise<boolean> {
    try {
      await this.fetchCredentials()
      return true
    } catch (error) {
      return !isEnvironmentMismatchError(error)
    }
  }

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
    let endpoint: string
    try {
      endpoint = resolvePowerSyncEndpoint(POWERSYNC_CONFIG.url, data.powersyncUrl, POWERSYNC_CONFIG.apiUrl)
    } catch (error) {
      if (isEnvironmentMismatchError(error)) {
        // Proteção, não falha: vira aviso no indicador. Continua lançando para o SDK nunca conectar nesse endpoint.
        if (this.environmentMismatch == null) console.warn(`[sync] ${(error as Error).message}`)
        this.setMismatch((error as Error).message)
      }
      throw error
    }
    this.setMismatch(null)
    if (!data.token || !endpoint) throw new Error('Resposta inválida de /powersync/token (token ou URL ausente).')
    this.cached = {
      endpoint,
      token: data.token,
      // ISO UTC (às vezes com microssegundos): normalizado e truncado em ms antes do new Date (Hermes).
      expiresAt: parseTimestamp(data.expiresAt) ?? new Date(Date.now() + 10 * 60_000),
    }
    return this.cached
  }

  /**
   * Um envio por vez: o SDK (primeiro plano) e a tarefa de segundo plano usam o mesmo connector; sem isto os dois
   * pegariam a mesma transação da fila.
   */
  private uploading: Promise<void> = Promise.resolve()

  uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const run = this.uploading.then(() => this.uploadNext(database))
    this.uploading = run.catch(() => undefined)
    return run
  }

  /** Dependências do upload (fila do PowerSync e saída de reenvio). */
  uploadDeps(database: CommonPowerSyncDatabase) {
    return {
      post: postBatch,
      saveRejections: (rows: Parameters<typeof saveRejections>[1]) => saveRejections(database, rows, newUlid),
      // Ordem obrigatória: foto (POST /shipments/:id/photos) antes do PUT/PATCH do vínculo com photo_id.
      ensurePhotos: (photoIds: string[]) =>
        ensurePhotosUploaded(photoIds, {
          db: database,
          upload: uploadShipmentPhoto,
          fileExists: localFileExists,
          now: () => new Date().toISOString(),
        }),
      newId: newUlid,
      // Contrato 11/11: animal leva o nome do tipo local (só no envio; nunca gravado no SQLite).
      enrichOp: (op: Parameters<typeof withAnimalTypeName>[0]) =>
        withAnimalTypeName(op, async (typeId) => {
          const row = await database.getOptional<{ name: string }>(`SELECT name FROM ${tableOf('animalTypes')} WHERE upper(id) = upper(?)`, [typeId])
          return row?.name ?? null
        }),
      onRemapped: (items: Parameters<typeof applyRemaps>[1]) => applyRemaps(database, items, newUlid).then(() => undefined),
    }
  }

  private async uploadNext(database: CommonPowerSyncDatabase): Promise<void> {
    const base = this.uploadDeps(database)
    const map = await loadIdMap(database)
    const deps = {
      ...base,
      mapOp: (op: Parameters<typeof applyIdMap>[0]) => applyIdMap(op, map),
      // Recusa por referência ausente/acesso: guardada como conflito (dado local protegido), a fila anda.
      park: (items: Parameters<typeof parkOps>[1]) => parkOps(database, items, newUlid),
      // Aceito pela API: guardado até o download confirmar (o checkpoint não pode apagar do aparelho).
      markSent: (ops: Parameters<typeof markSent>[1]) => markSent(database, ops, newUlid),
    }
    try {
      // 1) O que já saiu do ps_crud mas não chegou (inclui o que versões antigas marcaram como Pendência por engano),
      //    na ordem original e ANTES da fila: fazenda antes do animal que a cita.
      await requeueDeliveryFailures(database, newUlid)
      await flushOutbox(database, deps)
      // 2) Próxima transação da fila do PowerSync.
      const transaction = await database.getNextCrudTransaction()
      if (!transaction) {
        this.lastError = null
        // Fila vazia: conflitos cuja espera venceu são tentados de novo com o MESMO dado (sem forçar nada).
        await retryDueConflicts(database, { ...base, mapOp: deps.mapOp }).catch((error) => {
          if (error instanceof SessionEndedUploadError) throw error
        })
        return
      }
      await uploadTransaction(transaction, deps)
      this.lastError = null
    } catch (error) {
      this.lastError = error
      if (error instanceof SessionEndedUploadError) {
        console.warn('[sync] upload: sessão encerrada (401); a fila fica guardada até entrar de novo')
        await this.onSessionEnded()
        return
      }
      console.warn('[sync] upload falhou:', String((error as Error)?.message ?? error))
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
