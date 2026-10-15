import type { CorrectedVerb, SalaryEntry } from '@/@types/labor-calculation-v3'
import { generateMonthRange, monthRangeKey, toMonthRange } from './date-utils'

// A verb that carries no monetary correction (factor 1). Used as the neutral
// value before/without IPCA-E correction.
export const zeroCorrected = (original: number): CorrectedVerb => ({
  original,
  correctionFactor: 1,
  corrected: original,
  correctionAmount: 0,
})

// When no salary history is provided, synthesize a flat one from the contract
// bounds so the month-by-month FGTS/correction passes have entries to iterate.
export function buildDefaultSalaryHistory(
  startDate: Date,
  endDate: Date,
  lastSalary: number,
  baseSalary: number,
): SalaryEntry[] {
  const startMR = toMonthRange(startDate)
  const endMR = toMonthRange(endDate)
  const months = generateMonthRange(startMR, endMR)
  return months.map((m) => ({
    month: monthRangeKey(m),
    baseSalary,
    lastSalary,
  }))
}
