import type {
  CustomVerbaDetail,
  CustomVerbaInput,
  CustomVerbaMonthlyEntry,
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

export type CustomVerbasResult = {
  details: CustomVerbaDetail[]
  totalBruto: number
  totalCorrigido: number
  totalInterest: number
  // monthly sum of verbas with 'salarial' nature — feeds the FGTS base
  // (effectiveSalaryHist) and the monthly INSS bases.
  salarialByMonth: Record<string, number>
  salarialMonthlyAverage: number
}

// "Outras verbas" — lawyer-defined monthly amounts over a period.
// Corrected by IPCA-E + ADC 58 interest per month (same helpers as salaries).
// 'salarial' nature additionally feeds FGTS/INSS/IRPF bases and reflexos;
// 'indenizatoria' is principal + correction + interest only.
export function calculateCustomVerbas(
  verbas: CustomVerbaInput[],
  table: IndexTable,
  liquidationMonth: MonthRange,
  cutoffKey: string | undefined,
): CustomVerbasResult {
  const liquidKey = monthRangeKey(liquidationMonth)
  const details: CustomVerbaDetail[] = []
  const salarialByMonth: Record<string, number> = {}
  let totalBruto = 0
  let totalCorrigido = 0
  let totalInterest = 0
  let salarialTotal = 0
  let salarialMonths = 0

  for (const verba of verbas) {
    const months = generateMonthRange(
      parseMonthRangeKey(verba.startMonth),
      parseMonthRangeKey(verba.endMonth),
    )
    const monthValues = filterMonthEntries(
      months.map((m) => ({
        month: monthRangeKey(m),
        value: verba.monthlyValue,
      })),
      cutoffKey,
    )

    const corrected = correctMonthlyValues(monthValues, table, liquidationMonth)

    const monthlyEntries: CustomVerbaMonthlyEntry[] = []
    let bruto = 0
    let corrigido = 0
    let juros = 0
    for (const entry of corrected) {
      const rate = calculateAdc58InterestRate(table, entry.month, liquidKey)
      const interest = round(entry.corrected * rate)
      bruto = round(bruto + entry.original)
      corrigido = round(corrigido + entry.corrected)
      juros = round(juros + interest)
      if (verba.nature === 'salarial') {
        salarialByMonth[entry.month] = round(
          (salarialByMonth[entry.month] ?? 0) + entry.original,
        )
        salarialTotal = round(salarialTotal + entry.original)
        salarialMonths++
      }
      monthlyEntries.push({
        month: entry.month,
        value: entry.original,
        corrected: entry.corrected,
        correctionAmount: entry.correctionAmount,
        interest,
        total: round(entry.corrected + interest),
      })
    }

    totalBruto = round(totalBruto + bruto)
    totalCorrigido = round(totalCorrigido + corrigido)
    totalInterest = round(totalInterest + juros)

    details.push({
      name: verba.name,
      nature: verba.nature,
      bruto,
      corrigido,
      juros,
      total: round(corrigido + juros),
      monthlyEntries,
    })
  }

  return {
    details,
    totalBruto,
    totalCorrigido,
    totalInterest,
    salarialByMonth,
    salarialMonthlyAverage:
      salarialMonths > 0 ? round(salarialTotal / salarialMonths) : 0,
  }
}
