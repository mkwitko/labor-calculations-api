import type { MonthRange } from '@/services/labor-calculation/date-utils'
import {
  addMonths,
  monthRangeKey,
} from '@/services/labor-calculation/date-utils'
import type { IndexTable } from '@/services/labor-calculation/index-table'
import { getCorrectionFactor } from '@/services/labor-calculation/index-table'

const round = (v: number) => Math.round(v * 100) / 100

export type CorrectedValue = {
  original: number
  correctionFactor: number
  corrected: number
  correctionAmount: number
}

export function correctValue(
  value: number,
  table: IndexTable,
  dueMonth: MonthRange,
  liquidationMonth: MonthRange,
): CorrectedValue {
  const dueKey = monthRangeKey(addMonths(dueMonth, 1))
  const liquidKey = monthRangeKey(liquidationMonth)
  const factor = getCorrectionFactor(table, dueKey, liquidKey)
  const corrected = round(value * factor)
  return {
    original: value,
    correctionFactor: factor,
    corrected,
    correctionAmount: round(corrected - value),
  }
}

export type MonthlyCorrectedEntry = {
  month: string
  original: number
  correctionFactor: number
  corrected: number
  correctionAmount: number
}

export function correctMonthlyValues(
  monthlyValues: { month: string; value: number }[],
  table: IndexTable,
  liquidationMonth: MonthRange,
): MonthlyCorrectedEntry[] {
  const liquidKey = monthRangeKey(liquidationMonth)
  return monthlyValues.map((entry) => {
    const dueMonth = addMonths(
      {
        year: Number(entry.month.split('-')[0]),
        month: Number(entry.month.split('-')[1]),
      },
      1,
    )
    const dueKey = monthRangeKey(dueMonth)
    const factor = getCorrectionFactor(table, dueKey, liquidKey)
    const corrected = round(entry.value * factor)
    return {
      month: entry.month,
      original: entry.value,
      correctionFactor: factor,
      corrected,
      correctionAmount: round(corrected - entry.value),
    }
  })
}
