const round = (v: number) => Math.round(v * 100) / 100

export type InssBracket = {
  min: number
  max: number
  rate: number
  deduction: number
}

export const INSS_BRACKETS_2025: InssBracket[] = [
  { min: 0, max: 1412, rate: 0.075, deduction: 0 },
  { min: 1412.01, max: 2666.68, rate: 0.09, deduction: 21.18 },
  { min: 2666.69, max: 4000.03, rate: 0.12, deduction: 101.18 },
  { min: 4000.04, max: 7786.02, rate: 0.14, deduction: 181.18 },
]

export const INSS_TETO_2025 = 951.63

export type InssEmployeeEntry = {
  month: string
  base: number
  rate: number
  contribution: number
  limitedContribution: number
}

export type InssEmployeeResult = {
  entries: InssEmployeeEntry[]
  total: number
}

export function calculateInssEmployee(
  monthlyBases: { month: string; value: number }[],
  brackets: InssBracket[] = INSS_BRACKETS_2025,
  teto: number = INSS_TETO_2025,
): InssEmployeeResult {
  const entries: InssEmployeeEntry[] = []
  let total = 0
  for (const mb of monthlyBases) {
    const contribution = calculateInssOnValue(mb.value, brackets)
    const limitedContribution = Math.min(contribution, teto)
    total = round(total + limitedContribution)
    entries.push({
      month: mb.month,
      base: mb.value,
      rate: contribution / mb.value,
      contribution: round(contribution),
      limitedContribution: round(limitedContribution),
    })
  }
  return { entries, total: round(total) }
}

export function calculateInssOnValue(
  value: number,
  brackets: InssBracket[] = INSS_BRACKETS_2025,
): number {
  let total = 0
  for (const bracket of brackets) {
    if (value <= bracket.min) break
    const baseInBracket = Math.min(value, bracket.max) - bracket.min
    total += baseInBracket * bracket.rate
  }
  return round(total)
}

export type InssEmployerEntry = {
  month: string
  base: number
  employerRate: number
  employerContribution: number
  satRate: number
  satContribution: number
}

export type InssEmployerResult = {
  entries: InssEmployerEntry[]
  totalEmployer: number
  totalSat: number
  total: number
}

export function calculateInssEmployer(
  monthlyBases: { month: string; value: number }[],
  employerRate: number = 0.2,
  satRate: number = 0.03,
): InssEmployerResult {
  const entries: InssEmployerEntry[] = []
  let totalEmployer = 0
  let totalSat = 0
  for (const mb of monthlyBases) {
    const employerContribution = round(mb.value * employerRate)
    const satContribution = round(mb.value * satRate)
    totalEmployer = round(totalEmployer + employerContribution)
    totalSat = round(totalSat + satContribution)
    entries.push({
      month: mb.month,
      base: mb.value,
      employerRate,
      employerContribution,
      satRate,
      satContribution,
    })
  }
  return {
    entries,
    totalEmployer: round(totalEmployer),
    totalSat: round(totalSat),
    total: round(totalEmployer + totalSat),
  }
}
