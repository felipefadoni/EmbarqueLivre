/**
 * Envio da fila de alterações direto para a API (POST /api/v1/powersync/upload), independente do serviço PowerSync.
 *
 * Por que existe: o SDK do PowerSync só envia a fila enquanto o stream de download está de pé. Depois de uma falha
 * com o stream desconectado ele sai do laço de envio e só volta com uma nova escrita local ou com o stream conectado;
 * no modo `requests` ele ainda fica esperando o checkpoint do serviço depois de esvaziar a fila. Se o serviço
 * PowerSync está fora (VPS, wal_level, URL errada) mas a API está no ar, as alterações ficavam paradas sem aviso.
 *
 * - Automático: só quando o SDK NÃO está conectado (conectado, o próprio SDK envia), com rede, fila não vazia e fora
 *   do intervalo de espera. Espera crescente após falha temporária: 15 s → 30 s → 1 min → 2 min → 5 min (sem loop).
 * - Manual ("Enviar agora"): ignora a espera e devolve o resultado com mensagem pt-BR para a tela.
 * - Mesmas regras da fila (connector → uploadTransaction): 2xx enviado; rede/408/429/5xx fica pendente; 401 encerra a
 *   sessão; outros 4xx viram Pendências e o lote segue. Usa `connector.uploadData` (serializado com o SDK).
 * - Todo erro vira `problem` (mensagem clara) para o indicador: nada de falha muda.
 *
 * Puro (sem React Native), testável no Node.
 */
import { RetryableUploadError, SessionEndedUploadError } from './upload'
import type { DrainResult } from './backgroundDrain'

export type UploadProblemKind = 'offline' | 'network' | 'server' | 'session' | 'unexpected'
export type UploadProblem = { kind: UploadProblemKind; message: string; status?: number; at: number }

export type UploadRunOutcome = 'empty' | 'sent' | 'partial' | 'failed' | 'busy' | 'offline' | 'waiting'
export type UploadRunResult = { outcome: UploadRunOutcome; uploaded: number; remaining: number; problem: UploadProblem | null; message: string }

export type UploadPumpState = {
  running: boolean
  lastAttemptAt: number | null
  lastSuccessAt: number | null
  problem: UploadProblem | null
  nextRetryAt: number | null
  failures: number
  lastResult: UploadRunResult | null
}

export const UPLOAD_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** Erro do envio (connector/SDK/drain) → mensagem pt-BR curta para a tela. */
export function describeUploadProblem(error: unknown, apiLabel: string, at: number): UploadProblem {
  const server = apiLabel ? ` (${apiLabel})` : ''
  if (error instanceof SessionEndedUploadError || (error as { name?: string })?.name === 'SessionEndedUploadError') {
    return { kind: 'session', status: 401, at, message: 'Sua sessão expirou. Entre novamente para enviar as alterações.' }
  }
  if ((error as { name?: string })?.name === 'BatchBlockedUploadError') {
    // Lote inteiro recusado (rota/proxy/firewall): a mensagem já diz o que conferir. Os dados continuam na fila.
    const status = Number((error as { status?: number }).status ?? 0)
    return { kind: 'server', status, at, message: `${(error as Error).message}${server ? ` Servidor: ${apiLabel}.` : ''} Os dados continuam guardados.` }
  }
  const status =
    error instanceof RetryableUploadError || (error as { name?: string })?.name === 'RetryableUploadError'
      ? Number((error as { status?: number }).status ?? 0)
      : undefined
  if (status === 0) {
    return {
      kind: 'network',
      status: 0,
      at,
      message: `Não foi possível falar com o servidor${server}. Confira a internet e se o servidor está no ar.`,
    }
  }
  if (status !== undefined) {
    return {
      kind: 'server',
      status,
      at,
      message:
        status === 429 || status === 408
          ? `Servidor ocupado (HTTP ${status}). As alterações continuam guardadas e serão reenviadas.`
          : `O servidor respondeu com erro (HTTP ${status}). As alterações continuam guardadas e serão reenviadas.`,
    }
  }
  const text = String((error as Error)?.message ?? error ?? '').trim()
  if (/network|timeout|timed out|failed to fetch|internet|conex/i.test(text)) {
    return { kind: 'network', status: 0, at, message: `Não foi possível falar com o servidor${server}. Confira a internet e se o servidor está no ar.` }
  }
  return { kind: 'unexpected', at, message: `Erro ao enviar: ${text || 'motivo desconhecido'}. As alterações continuam guardadas.` }
}

export type UploadPumpDeps = {
  /** Transações/ops na fila local (ps_crud). */
  pendingCount: () => Promise<number>
  /** Esvazia a fila (drainUploadQueue com connector.uploadData). */
  drain: () => Promise<DrainResult>
  /** Último erro do connector (null = último envio deu certo). */
  lastError: () => unknown
  isOnline: () => boolean | Promise<boolean>
  /**
   * O SDK do PowerSync está conectado e dá conta do envio sozinho? (false com itens na saída de reenvio: o SDK só
   * chama o envio quando há algo no ps_crud.)
   */
  isSdkConnected: () => boolean | Promise<boolean>
  apiLabel?: string
  now?: () => number
  backoffMs?: readonly number[]
  log?: (message: string) => void
}

export function createUploadPump(deps: UploadPumpDeps) {
  const now = deps.now ?? Date.now
  const backoff = deps.backoffMs ?? UPLOAD_BACKOFF_MS
  const apiLabel = deps.apiLabel ?? ''
  let state: UploadPumpState = { running: false, lastAttemptAt: null, lastSuccessAt: null, problem: null, nextRetryAt: null, failures: 0, lastResult: null }
  const listeners = new Set<() => void>()
  let inflight: Promise<UploadRunResult> | null = null

  function set(patch: Partial<UploadPumpState>) {
    state = { ...state, ...patch }
    listeners.forEach((fn) => fn())
  }

  function fail(problem: UploadProblem, uploaded: number, remaining: number): UploadRunResult {
    const failures = state.failures + 1
    const wait = problem.kind === 'session' ? backoff[backoff.length - 1] : backoff[Math.min(failures, backoff.length) - 1]
    const sentPart = uploaded ? `${plural(uploaded, 'alteração enviada', 'alterações enviadas')}; ` : ''
    const result: UploadRunResult = {
      outcome: 'failed',
      uploaded,
      remaining,
      problem,
      message: `${sentPart}${plural(remaining, 'alteração não enviada', 'alterações não enviadas')}. ${problem.message}`,
    }
    set({ problem, failures, nextRetryAt: now() + wait, lastResult: result })
    return result
  }

  async function execute(manual: boolean): Promise<UploadRunResult> {
    const before = await deps.pendingCount().catch(() => 0)
    if (before === 0) {
      const result: UploadRunResult = { outcome: 'empty', uploaded: 0, remaining: 0, problem: null, message: 'Nada aguardando envio.' }
      set({ problem: null, failures: 0, nextRetryAt: null, lastResult: result })
      return result
    }
    if (!(await deps.isOnline())) {
      const problem: UploadProblem = {
        kind: 'offline',
        at: now(),
        message: 'Sem internet. As alterações ficam guardadas e são enviadas quando a rede voltar (Wi‑Fi ou dados móveis).',
      }
      const result: UploadRunResult = {
        outcome: 'offline',
        uploaded: 0,
        remaining: before,
        problem,
        message: `${plural(before, 'alteração aguardando envio', 'alterações aguardando envio')}. ${problem.message}`,
      }
      set({ problem, lastResult: result })
      return result
    }
    set({ running: true, lastAttemptAt: now() })
    let drained: DrainResult
    try {
      drained = await deps.drain()
    } catch (error) {
      const remaining = await deps.pendingCount().catch(() => before)
      return fail(describeUploadProblem(error, apiLabel, now()), 0, remaining)
    }
    const remaining = await deps.pendingCount().catch(() => before)
    // Contagem em alterações (ops da fila), a mesma unidade do indicador.
    const sent = Math.max(0, before - remaining)
    if (drained.status === 'retry') {
      return fail(describeUploadProblem(deps.lastError() ?? new Error(drained.error ?? ''), apiLabel, now()), sent, remaining)
    }
    if (drained.status === 'stalled') {
      const error = deps.lastError()
      const problem = error
        ? describeUploadProblem(error, apiLabel, now())
        : { kind: 'unexpected' as const, at: now(), message: 'A fila de envio não avançou. Tente de novo; se continuar, saia e entre novamente.' }
      return fail(problem, sent, remaining)
    }
    const result: UploadRunResult =
      remaining === 0
        ? {
            outcome: 'sent',
            uploaded: sent,
            remaining: 0,
            problem: null,
            message: sent ? `Tudo enviado (${plural(sent, 'alteração', 'alterações')}).` : 'Tudo enviado.',
          }
        : {
            outcome: 'partial',
            uploaded: sent,
            remaining,
            problem: null,
            message: `${plural(sent, 'alteração enviada', 'alterações enviadas')}; ${plural(remaining, 'continua', 'continuam')} na fila e ${remaining === 1 ? 'será enviada' : 'serão enviadas'} em seguida.`,
          }
    set({ problem: null, failures: 0, nextRetryAt: remaining ? now() : null, lastSuccessAt: now(), lastResult: result })
    if (manual || sent) deps.log?.(`[sync] envio direto: ${result.message}`)
    return result
  }

  function run({ manual = false }: { manual?: boolean } = {}): Promise<UploadRunResult> {
    if (inflight) return inflight
    inflight = execute(manual)
      .catch((error) => fail(describeUploadProblem(error, apiLabel, now()), 0, 0))
      .finally(() => {
        inflight = null
        set({ running: false })
      })
    return inflight
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /** "Enviar agora": ignora a espera; devolve o resultado para a tela. */
    sendNow: () => run({ manual: true }),
    /** Rede voltou / app em primeiro plano: nova chance já (zera a espera, mantém o aviso até dar certo). */
    resetBackoff() {
      if (state.nextRetryAt != null) set({ nextRetryAt: now() })
    },
    /** Chamado periodicamente: envia sozinho se for o caso. Devolve null quando não tentou. */
    async tick(): Promise<UploadRunResult | null> {
      if (inflight) return null
      if (state.nextRetryAt != null && now() < state.nextRetryAt) return null
      let connected = false
      try {
        connected = await deps.isSdkConnected()
      } catch {
        connected = false
      }
      const pending = await deps.pendingCount().catch(() => 0)
      if (pending === 0) {
        if (state.problem || state.nextRetryAt != null) set({ problem: null, failures: 0, nextRetryAt: null })
        return null
      }
      if (connected) return null
      if (!(await deps.isOnline())) return null
      return run({ manual: false })
    },
  }
}

export type UploadPump = ReturnType<typeof createUploadPump>
