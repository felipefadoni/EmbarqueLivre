/**
 * Períodos do Dashboard. "Hoje" é a data LOCAL do aparelho (todayIso → toIsoDateLocal), nunca UTC.
 * Semana começa na segunda; mês no dia 1. Puro (testável no Node).
 */
import { addDaysIso, parseIsoDateLocal, toIsoDateLocal } from '@/components/form/date'

export type ChartPeriod = 'dia' | 'semana' | 'mes'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** Pontos no gráfico (7 dias, 7 semanas ou 7 meses). */
export const CHART_POINTS = 7

function dateOf(iso: string): Date {
  const date = parseIsoDateLocal(iso)
  if (!date) throw new Error(`Data inválida: ${iso}`)
  return date
}

/** Segunda-feira da semana de `iso`. */
export function startOfWeekIso(iso: string): string {
  const day = dateOf(iso).getDay() // 0 = domingo
  return addDaysIso(iso, -((day + 6) % 7))
}

export function startOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Primeiro dia do mês `offset` meses antes de `iso`. */
export function monthStartBefore(iso: string, offset: number): string {
  const date = dateOf(startOfMonthIso(iso))
  return toIsoDateLocal(new Date(date.getFullYear(), date.getMonth() - offset, 1))
}

export type ChartBucket = { start: string; end: string; label: string }

/** Os 7 períodos que terminam hoje (o último é o atual, até hoje). */
export function chartBuckets(period: ChartPeriod, today: string): ChartBucket[] {
  const buckets: ChartBucket[] = []
  for (let i = CHART_POINTS - 1; i >= 0; i--) {
    if (period === 'dia') {
      const day = addDaysIso(today, -i)
      buckets.push({ start: day, end: day, label: WEEKDAYS[dateOf(day).getDay()] })
    } else if (period === 'semana') {
      const start = addDaysIso(startOfWeekIso(today), -7 * i)
      const end = i === 0 ? today : addDaysIso(start, 6)
      buckets.push({ start, end, label: `${start.slice(8, 10)}/${start.slice(5, 7)}` })
    } else {
      const start = monthStartBefore(today, i)
      const next = monthStartBefore(today, i - 1)
      const end = i === 0 ? today : addDaysIso(next, -1)
      buckets.push({ start, end, label: MONTHS[Number(start.slice(5, 7)) - 1] })
    }
  }
  return buckets
}

/** Soma as contagens por dia em cada período; dias sem lançamento contam zero. */
export function buildSeries(buckets: ChartBucket[], rows: readonly { day: string; n: number }[]) {
  const values = buckets.map(({ start, end }) =>
    rows.reduce((sum, row) => (row.day >= start && row.day <= end ? sum + Number(row.n || 0) : sum), 0),
  )
  return { labels: buckets.map((b) => b.label), values }
}

/** Milissegundos até a próxima meia-noite local (+1 s de folga), para recalcular "hoje". */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  return Math.max(1000, next.getTime() - now.getTime())
}
