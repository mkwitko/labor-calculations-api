import type {
  SalaryDifferenceDetail,
  SalaryDifferenceInput,
  SalaryDifferenceMonthlyEntry,
  SalaryEntry,
} from '@/@types/labor-calculation-v3'
import type { MonthRange } from './date-utils'
import {
  generateMonthRange,
  monthRangeKey,
  parseMonthRangeKey,
  round,
} from './date-utils'
import type { IndexTable } from './index-table'
import { calculateAdc58InterestRate } from './index-table'
import { correctMonthlyValues } from './monetary-correction'
import { filterMonthEntries } from './prescription'

export type SalaryDifferenceResult = {
  detail: SalaryDifferenceDetail
  // diff per month, used to increment the FGTS base (effectiveSalaryHist)
  // and the monthly INSS bases — avoids double-counting a separate FGTS reflexo.
  diffByMonth: Record<string, number>
  monthlyAverage: number
}

const emptyResult = (): SalaryDifferenceResult => ({
  detail: {
    monthlyEntries: [],
    totalDiff: 0,
    totalCorrected: 0,
    totalInterest: 0,
    reflexo13: 0,
    reflexoVacation: 0,
    reflexoAviso: 0,
  },
  diffByMonth: {},
  monthlyAverage: 0,
})

// Diferenças salariais por equiparação (CLT Art. 461) ou desvio de função.
// diff_m = max(0, dueSalary - receivedSalary) month by month; salary nature:
// corrected by IPCA-E (Súmula 381 TST) + ADC 58 interest per month, with
// reflexos on 13º, férias+1/3 and aviso prévio (Súmula 226 pattern).
export function calculateSalaryDifference(
  input: SalaryDifferenceInput,
  salaryHist: SalaryEntry[],
  fallbackSalary: number,
  table: IndexTable,
  liquidationMonth: MonthRange,
  contractStartKey: string,
  contractEndKey: string,
  cutoffKey: string | undefined,
  avos13: number,
  avosVacation: number,
  avisoPrevioDays: number,
): SalaryDifferenceResult {
  const receivedByMonth = new Map(
    salaryHist.map((s) => [s.month, s.lastSalary]),
  )

  const diffValues: { month: string; value: number }[] = []
  const dueByMonth = new Map<string, number>()
  const receivedUsedByMonth = new Map<string, number>()

  for (const period of input.periods) {
    const months = generateMonthRange(
      parseMonthRangeKey(period.startMonth),
      parseMonthRangeKey(period.endMonth),
    )
    for (const m of months) {
      const key = monthRangeKey(m)
      // clamp to the contract span
      if (key < contractStartKey || key > contractEndKey) continue
      const received =
        period.receivedSalary ?? receivedByMonth.get(key) ?? fallbackSalary
      const diff = round(Math.max(0, period.dueSalary - received))
      if (diff <= 0) continue
      dueByMonth.set(key, period.dueSalary)
      receivedUsedByMonth.set(key, received)
      diffValues.push({ month: key, value: diff })
    }
  }

  const inRange = filterMonthEntries(diffValues, cutoffKey).sort((a, b) =>
    a.month.localeCompare(b.month),
  )
  if (inRange.length === 0) return emptyResult()

  const liquidKey = monthRangeKey(liquidationMonth)
  const corrected = correctMonthlyValues(
    inRange.map((e) => ({ month: e.month, value: e.value })),
    table,
    liquidationMonth,
  )

  const monthlyEntries: SalaryDifferenceMonthlyEntry[] = []
  const diffByMonth: Record<string, number> = {}
  let totalDiff = 0
  let totalCorrected = 0
  let totalInterest = 0

  for (const entry of corrected) {
    const rate = calculateAdc58InterestRate(table, entry.month, liquidKey)
    const interest = round(entry.corrected * rate)
    totalDiff = round(totalDiff + entry.original)
    totalCorrected = round(totalCorrected + entry.corrected)
    totalInterest = round(totalInterest + interest)
    diffByMonth[entry.month] = entry.original
    monthlyEntries.push({
      month: entry.month,
      due: dueByMonth.get(entry.month) ?? 0,
      received: receivedUsedByMonth.get(entry.month) ?? 0,
      diff: entry.original,
      corrected: entry.corrected,
      correctionAmount: entry.correctionAmount,
      interest,
      total: round(entry.corrected + interest),
    })
  }

  const monthlyAverage = round(totalDiff / monthlyEntries.length)

  // Reflexos (Súmula 226 pattern, same formulas used for hour additionals):
  // 13º: salary nature (INSS applies); férias+1/3 and aviso are indenizatórios.
  let reflexo13 = 0
  let reflexoVacation = 0
  let reflexoAviso = 0
  if (input.applyReflexos) {
    reflexo13 = round(monthlyAverage * (avos13 / 12))
    reflexoVacation = round(monthlyAverage * (avosVacation / 12) * (4 / 3))
    const lastDiff = monthlyEntries[monthlyEntries.length - 1]?.diff ?? 0
    reflexoAviso = round((lastDiff / 30) * avisoPrevioDays)
  }

  return {
    detail: {
      monthlyEntries,
      totalDiff,
      totalCorrected,
      totalInterest,
      reflexo13,
      reflexoVacation,
      reflexoAviso,
    },
    diffByMonth,
    monthlyAverage,
  }
}
