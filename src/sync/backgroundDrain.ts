/**
 * Envio da fila do PowerSync numa janela curta de segundo plano (BGTaskScheduler no iOS / WorkManager no Android).
 * Puro (testável no Node). Cada passo é `connector.uploadData` (a mesma ordem do primeiro plano: foto → vínculo →
 * finalizar; recusas definitivas viram Pendências e a fila anda). Para em: fila vazia, prazo, aviso de expiração do SO,
 * falha temporária (rede/408/429/5xx: o SO agenda outra janela; nada de retry em loop) ou sem progresso
 * (ex.: sessão encerrada no 401).
 */
export type DrainStatus = 'empty' | 'done' | 'retry' | 'stopped' | 'stalled'
export type DrainResult = { status: DrainStatus; uploaded: number; error?: string }

export async function drainUploadQueue(deps: {
  /** id da próxima transação da fila (null = vazia). */
  nextTransactionId: () => Promise<number | string | null>
  /** Envia a próxima transação (connector.uploadData). Lança em falha temporária. */
  upload: () => Promise<void>
  now: () => number
  /** Prazo absoluto (ms) para parar com folga antes de o SO encerrar. */
  deadline: number
  shouldStop?: () => boolean
  maxTransactions?: number
}): Promise<DrainResult> {
  const max = deps.maxTransactions ?? 500
  let uploaded = 0
  for (let i = 0; i < max; i++) {
    if (deps.shouldStop?.() || deps.now() >= deps.deadline) return { status: 'stopped', uploaded }
    const before = await deps.nextTransactionId()
    if (before == null) return { status: uploaded ? 'done' : 'empty', uploaded }
    try {
      await deps.upload()
    } catch (error) {
      return { status: 'retry', uploaded, error: String((error as Error)?.message ?? error) }
    }
    const after = await deps.nextTransactionId()
    if (after != null && after === before) return { status: 'stalled', uploaded }
    uploaded++
  }
  return { status: 'stopped', uploaded }
}
