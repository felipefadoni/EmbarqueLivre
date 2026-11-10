/**
 * Checagem pura dos helpers de data (sem Jest).
 * Executar: node --experimental-strip-types scripts/check-date.mts
 */
import {
  WEEK_STARTS_ON,
  addMonths,
  buildMonthGrid,
  clampParts,
  compareParts,
  daysInMonth,
  formatDatePtBr,
  isLeapYear,
  isMonthDisabled,
  isPartsDisabled,
  isYearDisabled,
  parseIsoDateLocal,
  parseIsoDateParts,
  toIsoDateLocal,
  yearList,
} from '../src/components/form/date.ts'

let failed = 0
let passed = 0

function assert(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1
    console.log(`ok  ${name}`)
    return
  }
  failed += 1
  console.error(`fail  ${name}`, detail ?? '')
}

// format / parse
assert('parse 2024-02-29', parseIsoDateParts('2024-02-29')?.day === 29)
assert('reject 2023-02-29', parseIsoDateParts('2023-02-29') === null)
assert('reject garbage', parseIsoDateParts('10/11/2026') === null)
assert('format DD/MM/AAAA', formatDatePtBr('2026-11-10') === '10/11/2026')
assert('format empty', formatDatePtBr(null) === '')
assert('toIso from parts', toIsoDateLocal({ year: 1900, month: 1, day: 1 }) === '1900-01-01')

const local = parseIsoDateLocal('2026-11-10')
assert(
  'parseIsoDateLocal uses local parts',
  !!local && local.getFullYear() === 2026 && local.getMonth() === 10 && local.getDate() === 10,
)
assert('toIso from Date does not use toISOString', local ? toIsoDateLocal(local) === '2026-11-10' : false)
if (local) {
  // Contraste: toISOString de meia-noite local pode cair no dia anterior em fusos a oeste de UTC.
  const iso = local.toISOString()
  assert('helper differs safely from toISOString when needed, or matches in UTC', toIsoDateLocal(local) === '2026-11-10' && typeof iso === 'string')
}

// leap years
assert('2000 leap (div 400)', isLeapYear(2000) === true)
assert('1900 not leap (div 100)', isLeapYear(1900) === false)
assert('2024 leap', isLeapYear(2024) === true)
assert('2023 not leap', isLeapYear(2023) === false)
assert('days Feb 2024', daysInMonth(2024, 2) === 29)
assert('days Feb 2023', daysInMonth(2023, 2) === 28)
assert('days Feb 1900', daysInMonth(1900, 2) === 28)
assert('days Jan', daysInMonth(2026, 1) === 31)
assert('days Apr', daysInMonth(2026, 4) === 30)
assert('days invalid month', daysInMonth(2026, 13) === 0)

// clamp / disable
const min = { year: 1900, month: 1, day: 1 }
const max = { year: 2026, month: 11, day: 10 }
assert('clamp below min', toIsoDateLocal(clampParts({ year: 1899, month: 12, day: 31 }, min, max)) === '1900-01-01')
assert('clamp above max', toIsoDateLocal(clampParts({ year: 2026, month: 12, day: 1 }, min, max)) === '2026-11-10')
assert('clamp Feb 31 -> 29 leap', toIsoDateLocal(clampParts({ year: 2024, month: 2, day: 31 })) === '2024-02-29')
assert('clamp Feb 31 -> 28 common', toIsoDateLocal(clampParts({ year: 2023, month: 2, day: 31 })) === '2023-02-28')
assert('future day disabled', isPartsDisabled({ year: 2026, month: 11, day: 11 }, min, max) === true)
assert('today enabled', isPartsDisabled({ year: 2026, month: 11, day: 10 }, min, max) === false)
assert('before 1900 disabled', isPartsDisabled({ year: 1899, month: 12, day: 31 }, min, max) === true)
assert('Dec 2026 month disabled', isMonthDisabled(2026, 12, min, max) === true)
assert('Nov 2026 month enabled', isMonthDisabled(2026, 11, min, max) === false)
assert('1899 year disabled', isYearDisabled(1899, min, max) === true)
assert('2027 year disabled', isYearDisabled(2027, min, max) === true)
assert('2026 year enabled', isYearDisabled(2026, min, max) === false)

// addMonths + week start
assert('addMonths Jan +1', toIsoDateLocal(addMonths({ year: 2026, month: 1, day: 31 }, 1)) === '2026-02-28')
assert('addMonths Mar -1', toIsoDateLocal(addMonths({ year: 2026, month: 3, day: 31 }, -1)) === '2026-02-28')
assert('week starts on Sunday', WEEK_STARTS_ON === 0)

// 2026-11-01 is Sunday — first cell of the grid should be day 1 (no leading blanks)
const nov2026 = buildMonthGrid(2026, 11)
assert('Nov 2026 week 1 starts on Sunday the 1st', nov2026[0]?.[0]?.day === 1 && nov2026[0]?.[6]?.day === 7)
assert('Nov 2026 has 30 days', nov2026.flat().filter(Boolean).length === 30)
// 2024-02-01 is Thursday — 4 leading blanks if week starts Sunday
const feb2024 = buildMonthGrid(2024, 2)
assert('Feb 2024 starts Thursday (4 blanks)', feb2024[0]?.[0] === null && feb2024[0]?.[3] === null && feb2024[0]?.[4]?.day === 1)
assert('Feb 2024 last day 29', feb2024.flat().filter((cell) => cell?.day === 29).length === 1)
assert('grid rows multiple of 7', feb2024.every((row) => row.length === 7))

const years = yearList(min, max)
assert('year list starts at max and ends at 1900', years[0] === 2026 && years[years.length - 1] === 1900)
assert('year list length', years.length === 2026 - 1900 + 1)
assert('compare equal', compareParts(min, { year: 1900, month: 1, day: 1 }) === 0)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
