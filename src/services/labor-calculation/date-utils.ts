export const round = (v: number) => Math.round(v * 100) / 100

export type MonthRange = {
  year: number
  month: number
}

export function toMonthRange(d: Date): MonthRange {
  const iso = d.toISOString().slice(0, 10)
  const [year, month] = iso.split('-').map(Number)
  return { year, month }
}

export function monthRangeToDate(m: MonthRange): Date {
  return new Date(m.year, m.month - 1, 1)
}

export function monthRangeKey(m: MonthRange): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`
}

export function parseMonthRangeKey(key: string): MonthRange {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m }
}

export function addMonths(m: MonthRange, n: number): MonthRange {
  const total = m.year * 12 + (m.month - 1) + n
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

export function diffMonths(a: MonthRange, b: MonthRange): number {
  return (a.year - b.year) * 12 + (a.month - b.month)
}

export function generateMonthRange(
  start: MonthRange,
  end: MonthRange,
): MonthRange[] {
  const months: MonthRange[] = []
  let current = start
  while (
    current.year < end.year ||
    (current.year === end.year && current.month <= end.month)
  ) {
    months.push(current)
    current = addMonths(current, 1)
  }
  return months
}

export function countAvos(startDate: Date, referenceDate: Date): number {
  const start = toMonthRange(startDate)
  const end = toMonthRange(referenceDate)
  return diffMonths(end, start) + 1
}

// Counts months where ≥ 15 days were worked between two dates (½-month rule).
function countAvosInRange(from: Date, to: Date): number {
  let avos = 0
  let current = toMonthRange(from)
  const endMR = toMonthRange(to)
  while (
    current.year < endMR.year ||
    (current.year === endMR.year && current.month <= endMR.month)
  ) {
    const dim = daysInMonth(current.year, current.month)
    let worked = dim
    if (
      current.year === from.getFullYear() &&
      current.month === from.getMonth() + 1
    ) {
      worked = dim - from.getDate() + 1
    }
    if (current.year === endMR.year && current.month === endMR.month) {
      worked = Math.min(worked, to.getDate())
    }
    if (worked >= 15) avos++
    current = addMonths(current, 1)
  }
  return avos
}

// 13th salary avos: calendar year Jan 1 (or hire date) → projectedEnd, ≥15-day rule.
// CLT Art. 130 + TST OJ 34: only months in the termination calendar year count.
export function count13thAvos(
  startDate: Date,
  endDate: Date,
  projectedEnd: Date,
): number {
  const termYear = endDate.getFullYear()
  const yearStart = new Date(Date.UTC(termYear, 0, 1))
  const countFrom = startDate > yearStart ? startDate : yearStart
  return countAvosInRange(countFrom, projectedEnd)
}

// Vacation avos: aquisitive period (hire date → projectedEnd), ≥15-day rule, max 12.
// CLT Art. 130: each avo = 1 month of the 12-month aquisitive period.
export function countVacationAvos(startDate: Date, projectedEnd: Date): number {
  return Math.min(countAvosInRange(startDate, projectedEnd), 12)
}

export function countWorkedMonths(
  startDate: Date,
  endDate: Date,
): { years: number; months: number; days: number; totalMonths: number } {
  const diffMs = endDate.getTime() - startDate.getTime()
  const totalDays = diffMs / (1000 * 60 * 60 * 24)
  const years = Math.floor(totalDays / 365.25)
  const remainDays = totalDays - years * 365.25
  const months = Math.floor(remainDays / 30)
  const days = Math.floor(remainDays - months * 30)
  const totalMonths = round(years * 12 + months + days / 30)
  return { years, months, days, totalMonths }
}

// Lei 12.506/2011: 30 days + 3 per worked year, capped at 90 total (60 extra max)
export function calculateAvisoPrevioDays(workedYears: number): number {
  return Math.min(30 + workedYears * 3, 90)
}

export function projectEndDate(
  endDate: Date,
  workedYears: number,
  avisoPrevioCumprido: boolean,
): Date {
  if (avisoPrevioCumprido) return endDate
  const days = calculateAvisoPrevioDays(workedYears)
  const projected = new Date(endDate)
  projected.setDate(projected.getDate() + days)
  return projected
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function partialMonthDays(
  year: number,
  month: number,
  daysWorked: number,
): number {
  return Math.min(daysWorked, daysInMonth(year, month))
}

export function getDaysWorkedInMonth(
  year: number,
  month: number,
  firstDay: number,
  lastDay: number,
): number {
  const dim = daysInMonth(year, month)
  const start = Math.max(1, firstDay)
  const end = Math.min(dim, lastDay)
  return end - start + 1
}
