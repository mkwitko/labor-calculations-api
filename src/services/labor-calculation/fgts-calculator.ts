import type { MonthRange } from '@/services/labor-calculation/date-utils'
import { monthRangeKey } from '@/services/labor-calculation/date-utils'
import type { IndexTable } from '@/services/labor-calculation/index-table'
import { calculateAdc58InterestRate } from '@/services/labor-calculation/index-table'
import { correctMonthlyValues } from '@/services/labor-calculation/monetary-correction'

const round = (v: number) => Math.round(v * 100) / 100

export type SalaryEntry = {
  month: string
  baseSalary: number
  lastSalary: number
}

export type FgtsMonthlyEntry = {
  month: string
  base: number
  aliquot: number
  deposit: number
  corrected: number
  correctionAmount: number
  interest: number
  total: number
}

export type FgtsResult = {
  monthlyEntries: FgtsMonthlyEntry[]
  totalDeposit: number
  totalCorrected: number
  totalInterest: number
  totalFgts: number
  fineBase: number
  fineValue: number
  fineCorrected: number
}

export function calculateFgtsMonthly(
  salaryHistory: SalaryEntry[],
  fgtsRate: number,
  table: IndexTable,
  liquidationMonth: MonthRange,
  include13thBase: number = 0,
  includeAvisoPrevioBase: number = 0,
): FgtsResult {
  const monthlyEntries: FgtsMonthlyEntry[] = []
  let totalDeposit = 0
  let totalCorrected = 0
  const liquidKey = monthRangeKey(liquidationMonth)
  const correctedEntries = correctMonthlyValues(
    salaryHistory.map((s) => ({
      month: s.month,
      value: round(s.lastSalary * fgtsRate),
    })),
    table,
    liquidationMonth,
  )

  for (let i = 0; i < salaryHistory.length; i++) {
    const salary = salaryHistory[i]
    const deposit = round(salary.lastSalary * fgtsRate)
    const corrected = correctedEntries[i]?.corrected ?? deposit
    const correctionAmount = correctedEntries[i]?.correctionAmount ?? 0
    const interestRate = calculateAdc58InterestRate(
      table,
      salary.month,
      liquidKey,
    )
    const interest = round(corrected * interestRate)
    totalDeposit = round(totalDeposit + deposit)
    totalCorrected = round(totalCorrected + corrected)
    monthlyEntries.push({
      month: salary.month,
      base: salary.lastSalary,
      aliquot: fgtsRate,
      deposit,
      corrected,
      correctionAmount,
      interest,
      total: round(corrected + interest),
    })
  }

  // 13th and aviso prévio FGTS are separate obligations — they contribute to totals
  // but are not stored as salary-month entries (no unique month to assign them to).
  const lastMonth = salaryHistory.at(-1)?.month ?? liquidKey

  if (include13thBase > 0) {
    const deposit13 = round(include13thBase * fgtsRate)
    const corrected13Entries = correctMonthlyValues(
      [{ month: lastMonth, value: deposit13 }],
      table,
      liquidationMonth,
    )
    const corrected13 = corrected13Entries[0]?.corrected ?? deposit13
    totalDeposit = round(totalDeposit + deposit13)
    totalCorrected = round(totalCorrected + corrected13)
  }

  if (includeAvisoPrevioBase > 0) {
    const depositAP = round(includeAvisoPrevioBase * fgtsRate)
    const correctedAPEntries = correctMonthlyValues(
      [{ month: lastMonth, value: depositAP }],
      table,
      liquidationMonth,
    )
    const correctedAP = correctedAPEntries[0]?.corrected ?? depositAP
    totalDeposit = round(totalDeposit + depositAP)
    totalCorrected = round(totalCorrected + correctedAP)
  }

  const totalInterest = round(
    monthlyEntries.reduce((sum, e) => round(sum + e.interest), 0),
  )
  const totalFgts = round(totalCorrected + totalInterest)
  // Fine base = corrected balance only (ADC 58 interest is a separate judicial award — CLT Art. 477-B).
  const fineBase = totalCorrected
  const fineValue = round(fineBase * 0.4)
  const fineCorrectedEntry = correctMonthlyValues(
    [{ month: lastMonth, value: fineValue }],
    table,
    liquidationMonth,
  )
  const fineCorrected = fineCorrectedEntry[0]?.corrected ?? fineValue

  return {
    monthlyEntries,
    totalDeposit,
    totalCorrected,
    totalInterest,
    totalFgts,
    fineBase,
    fineValue,
    fineCorrected,
  }
}
