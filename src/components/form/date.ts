/**
 * Helpers de data civil (partes locais ano/mês/dia).
 * Nunca usa Date#toISOString — evita deslocar o dia por fuso.
 *
 * Calendário: a semana começa no domingo (D S T Q Q S S).
 */

export type DateParts = {
  year: number
  month: number
  day: number
}

/** 0 = domingo. */
export const WEEK_STARTS_ON = 0

export const WEEKDAY_INITIALS_PT_BR = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const

export const MONTH_NAMES_PT_BR = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

export const MONTH_SHORT_PT_BR = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[month - 1]
}

export function isValidParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

export function parseIsoDateParts(iso: string | null | undefined): DateParts | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!isValidParts(year, month, day)) return null
  return { year, month, day }
}

/** Interpreta YYYY-MM-DD como meia-noite local (não UTC). */
export function parseIsoDateLocal(iso: string | null | undefined): Date | null {
  const parts = parseIsoDateParts(iso)
  if (!parts) return null
  return partsToDate(parts)
}

export function partsToDate(parts: DateParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day)
}

export function dateToParts(date: Date): DateParts {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

export function todayParts(): DateParts {
  return dateToParts(new Date())
}

export function toIsoDateLocal(input: Date | DateParts): string {
  const parts = isDateParts(input) ? input : dateToParts(input)
  const year = String(parts.year).padStart(4, '0')
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDatePtBr(iso: string | null | undefined): string {
  const parts = parseIsoDateParts(iso)
  if (!parts) return ''
  return formatPartsPtBr(parts)
}

export function formatPartsPtBr(parts: DateParts): string {
  const day = String(parts.day).padStart(2, '0')
  const month = String(parts.month).padStart(2, '0')
  const year = String(parts.year).padStart(4, '0')
  return `${day}/${month}/${year}`
}

export function compareParts(a: DateParts, b: DateParts): number {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

export function clampDay(parts: DateParts): DateParts {
  const maxDay = daysInMonth(parts.year, parts.month)
  if (maxDay === 0) return { year: parts.year, month: 1, day: 1 }
  return { ...parts, day: Math.min(Math.max(1, parts.day), maxDay) }
}

export function clampParts(value: DateParts, min?: DateParts | null, max?: DateParts | null): DateParts {
  let next = clampDay(value)
  if (min && compareParts(next, min) < 0) next = clampDay(min)
  if (max && compareParts(next, max) > 0) next = clampDay(max)
  return next
}

export function isPartsDisabled(parts: DateParts, min?: DateParts | null, max?: DateParts | null): boolean {
  if (min && compareParts(parts, min) < 0) return true
  if (max && compareParts(parts, max) > 0) return true
  return false
}

export function isMonthDisabled(year: number, month: number, min?: DateParts | null, max?: DateParts | null): boolean {
  const start = { year, month, day: 1 }
  const end = { year, month, day: daysInMonth(year, month) }
  if (!end.day) return true
  if (max && compareParts(start, max) > 0) return true
  if (min && compareParts(end, min) < 0) return true
  return false
}

export function isYearDisabled(year: number, min?: DateParts | null, max?: DateParts | null): boolean {
  if (max && year > max.year) return true
  if (min && year < min.year) return true
  return false
}

export function addMonths(parts: DateParts, delta: number): DateParts {
  const index = parts.year * 12 + (parts.month - 1) + delta
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return clampDay({ year, month, day: parts.day })
}

/** 0 = domingo … 6 = sábado, com construtor local. */
export function weekdaySundayIndex(parts: DateParts): number {
  return partsToDate(parts).getDay()
}

export function buildMonthGrid(
  year: number,
  month: number,
  weekStartsOn: number = WEEK_STARTS_ON,
): (DateParts | null)[][] {
  const first = weekdaySundayIndex({ year, month, day: 1 })
  const offset = (first - weekStartsOn + 7) % 7
  const count = daysInMonth(year, month)
  const cells: (DateParts | null)[] = []
  for (let i = 0; i < offset; i += 1) cells.push(null)
  for (let day = 1; day <= count; day += 1) cells.push({ year, month, day })
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: (DateParts | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

export function yearList(min?: DateParts | null, max?: DateParts | null): number[] {
  const start = min?.year ?? 1900
  const end = max?.year ?? todayParts().year
  const years: number[] = []
  for (let year = end; year >= start; year -= 1) years.push(year)
  return years
}

export function toPartsFromDate(date?: Date | null): DateParts | null {
  if (!date || Number.isNaN(date.getTime())) return null
  return dateToParts(date)
}

function isDateParts(value: Date | DateParts): value is DateParts {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && 'year' in value && 'month' in value && 'day' in value
}
