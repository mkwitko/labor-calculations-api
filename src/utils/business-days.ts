const NATIONAL_HOLIDAYS = [
  { month: 1, day: 1 },
  { month: 4, day: 21 },
  { month: 5, day: 1 },
  { month: 9, day: 7 },
  { month: 10, day: 12 },
  { month: 11, day: 2 },
  { month: 11, day: 15 },
  { month: 11, day: 20 },
  { month: 12, day: 25 },
]

function isHoliday(date: Date): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return NATIONAL_HOLIDAYS.some((h) => h.month === month && h.day === day)
}

function isWeekend(date: Date): boolean {
  const dow = date.getDay()
  return dow === 0 || dow === 6
}

export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isHoliday(date)
}

export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (isBusinessDay(result)) added++
  }
  return result
}
