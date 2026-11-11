import { OUTBOX_UNSENT_COUNT_SQL } from './outbox'
import { REJECTIONS_COUNT_SQL } from './rejections'

export type UnsentCounter = {
  getUploadQueueStats(): Promise<{ count: number }>
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
}

/**
 * Lido na hora do "Sair" (não do contador da tela, que pode estar alguns segundos atrasado):
 * alterações ainda na fila de envio + pendências recusadas não resolvidas.
 */
export async function countUnsentChanges(db: UnsentCounter) {
  const [stats, rejected, parked] = await Promise.all([
    db.getUploadQueueStats().catch(() => ({ count: 0 })),
    db.getOptional<{ n: number }>(REJECTIONS_COUNT_SQL).catch(() => null),
    db.getOptional<{ n: number }>(OUTBOX_UNSENT_COUNT_SQL).catch(() => null),
  ])
  const uploads = Number(stats.count ?? 0) + Number(parked?.n ?? 0)
  const rejections = Number(rejected?.n ?? 0)
  return { uploads, rejections, total: uploads + rejections }
}

/**
 * Regra (Felipe): com alterações não enviadas ou pendências, pedir confirmação; só limpa se confirmar.
 * Retorna true se saiu.
 */
export async function logoutWithGuard(deps: {
  count: () => Promise<{ total: number }>
  confirm: (total: number) => Promise<boolean>
  logout: () => Promise<void>
}): Promise<boolean> {
  const { total } = await deps.count()
  if (total > 0 && !(await deps.confirm(total))) return false
  await deps.logout()
  return true
}
