/**
 * Logger do PowerSync para o app. O logger padrão manda falhas de conexão para `console.error`, o que no dev
 * build abre o overlay vermelho "Console Error" a cada tentativa (ex.: serviço PowerSync reiniciando).
 * Falhas de rede/servidor são temporárias e o SDK reconecta sozinho: viram `console.warn`.
 * O estado aparece em pt-BR no indicador de sincronização. Puro (testável no Node).
 */
type LogRecord = { level: number; message: string; error?: unknown }
type Sink = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>

const LEVEL = { debug: 20, info: 30, warn: 40, error: 50 } as const

const TRANSIENT = /fetch failed|could not connect|network request failed|failed to fetch|timed? ?out|ECONNREFUSED|ECONNRESET|socket|websocket|aborted|503|502|504|Service Unavailable/i

export function isTransientSyncError(record: LogRecord): boolean {
  const error = record.error as { message?: unknown } | undefined
  const text = `${record.message} ${typeof error === 'object' && error ? String(error.message ?? '') : String(error ?? '')}`
  return TRANSIENT.test(text)
}

export function createSyncLogger(sink: Sink = console, minLevel: number = LEVEL.info) {
  return {
    log(record: LogRecord) {
      if (record.level < minLevel) return
      const args: unknown[] = [`[PowerSync] ${record.message}`]
      if (record.error !== undefined) args.push(record.error)
      if (record.level >= LEVEL.error) (isTransientSyncError(record) ? sink.warn : sink.error)(...args)
      else if (record.level >= LEVEL.warn) sink.warn(...args)
      else if (record.level >= LEVEL.info) sink.info(...args)
      else sink.debug(...args)
    },
  }
}
