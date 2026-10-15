import type { MonthRange } from '@/services/labor-calculation/date-utils'
import {
  addMonths,
  generateMonthRange,
  monthRangeKey,
} from '@/services/labor-calculation/date-utils'
import type { IndexTable } from '@/services/labor-calculation/index-table'
import {
  getSelicCumulative,
  getTrdRate,
} from '@/services/labor-calculation/index-table'

const round = (v: number) => Math.round(v * 100) / 100

export type InterestEntry = {
  month: string
  rate: number
  base: number
  interest: number
}

export type InterestResult = {
  entries: InterestEntry[]
  totalInterest: number
  totalBase: number
}

export type InterestMode = 'trd' | 'taxa_legal'

export function calculateInterest(
  correctedValue: number,
  dueMonth: MonthRange,
  filingMonth: MonthRange,
  liquidationMonth: MonthRange,
  table: IndexTable,
  inssDeduction: number,
): InterestResult {
  const entries: InterestEntry[] = []
  let totalInterest = 0
  const effectiveBase = round(correctedValue - inssDeduction)
  if (effectiveBase <= 0) {
    return { entries, totalInterest: 0, totalBase: effectiveBase }
  }
  const startInterest = addMonths(dueMonth, 1)
  const months = generateMonthRange(startInterest, liquidationMonth)
  for (const m of months) {
    const key = monthRangeKey(m)
    const mode: InterestMode =
      m.year > filingMonth.year ||
      (m.year === filingMonth.year && m.month >= filingMonth.month)
        ? 'taxa_legal'
        : 'trd'
    let rate: number
    if (mode === 'trd') {
      rate = getTrdRate(table, key)
    } else {
      const prevMonth = addMonths(m, -1)
      const prevKey = monthRangeKey(prevMonth)
      const liquidKey = monthRangeKey(liquidationMonth)
      const selicFactor = getSelicCumulative(table, prevKey, liquidKey)
      rate = (selicFactor - 1) * 100
    }
    const interest = round((effectiveBase * (rate / 100)) / 12)
    totalInterest = round(totalInterest + interest)
    entries.push({ month: key, rate, base: effectiveBase, interest })
  }
  return { entries, totalInterest, totalBase: effectiveBase }
}

export function calculateSimpleInterest(
  correctedValue: number,
  dueMonth: MonthRange,
  liquidationMonth: MonthRange,
  annualRate: number,
  inssDeduction: number = 0,
): InterestResult {
  const entries: InterestEntry[] = []
  const effectiveBase = round(correctedValue - inssDeduction)
  if (effectiveBase <= 0) {
    return { entries, totalInterest: 0, totalBase: effectiveBase }
  }
  const startInterest = addMonths(dueMonth, 1)
  const months = generateMonthRange(startInterest, liquidationMonth)
  const monthlyRate = annualRate / 100 / 12
  let totalInterest = 0
  for (const m of months) {
    const key = monthRangeKey(m)
    const interest = round(effectiveBase * monthlyRate)
    totalInterest = round(totalInterest + interest)
    entries.push({
      month: key,
      rate: annualRate / 12,
      base: effectiveBase,
      interest,
    })
  }
  return { entries, totalInterest, totalBase: effectiveBase }
}
