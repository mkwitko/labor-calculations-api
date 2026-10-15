import type { MonthRange } from './date-utils'
import { monthRangeKey, toMonthRange } from './date-utils'

// Prescrição quinquenal (CF Art. 7º, XXIX; STF ARE 709.212 for FGTS):
// claims older than 5 years before the filing date are time-barred.
// Granularity is the calendar month: a month with key < cutoff falls entirely.
// FGTS for month M is due in M+1, so this criterion is slightly conservative
// in favor of the reclamado — acceptable for liquidation purposes.
export function getPrescricaoCutoffKey(base: Date): string {
  const baseMonth = toMonthRange(base)
  const cutoff: MonthRange = {
    year: baseMonth.year - 5,
    month: baseMonth.month,
  }
  return monthRangeKey(cutoff)
}

// Keeps only entries from the cutoff month onward. 'YYYY-MM' keys compare
// lexicographically in chronological order.
export function filterMonthEntries<T extends { month: string }>(
  entries: T[],
  cutoffKey?: string,
): T[] {
  if (!cutoffKey) return entries
  return entries.filter((e) => e.month >= cutoffKey)
}
