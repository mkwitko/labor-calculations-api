const round = (v: number) => Math.round(v * 100) / 100

export type IrpfBracket = {
  min: number
  max: number
  rate: number
  deduction: number
}

export const IRPF_BRACKETS_2025: IrpfBracket[] = [
  { min: 0, max: 12144, rate: 0, deduction: 0 },
  { min: 12144.01, max: 25188, rate: 0.075, deduction: 910.8 },
  { min: 25188.01, max: 37944, rate: 0.15, deduction: 2802.72 },
  { min: 37944.01, max: 50352, rate: 0.225, deduction: 5646.24 },
  { min: 50352.01, max: Infinity, rate: 0.275, deduction: 8161.92 },
]

export type IrpfResult = {
  base: number
  brackets: IrpfBracket[]
  applicableBracket: IrpfBracket
  taxDue: number
  effectiveRate: number
}

export function calculateIrpfAcumulado(
  totalRemuneration: number,
  inssDeduction: number = 0,
  dependents: number = 0,
  dependentDeduction: number = 189.59,
  brackets: IrpfBracket[] = IRPF_BRACKETS_2025,
): IrpfResult {
  const base = round(
    totalRemuneration - inssDeduction - dependents * dependentDeduction,
  )
  if (base <= 0) {
    return {
      base: 0,
      brackets,
      applicableBracket: brackets[0],
      taxDue: 0,
      effectiveRate: 0,
    }
  }
  let applicableBracket = brackets[0]
  for (const bracket of brackets) {
    if (base >= bracket.min) {
      applicableBracket = bracket
    }
  }
  const taxDue = round(
    Math.max(0, base * applicableBracket.rate - applicableBracket.deduction),
  )
  const effectiveRate = base > 0 ? round((taxDue / base) * 100) : 0
  return {
    base,
    brackets,
    applicableBracket,
    taxDue,
    effectiveRate,
  }
}

export type IrpfHonorariosResult = {
  base: number
  taxDue: number
  effectiveRate: number
}

export const IRPF_HONORARIOS_BRACKETS = [
  { min: 0, max: 684.72, rate: 0, deduction: 0 },
  { min: 684.73, max: 924.6, rate: 0.075, deduction: 51.35 },
  { min: 924.61, max: 1248.3, rate: 0.15, deduction: 120.69 },
  { min: 1248.31, max: 2213.4, rate: 0.225, deduction: 214.27 },
  { min: 2213.41, max: Infinity, rate: 0.275, deduction: 324.89 },
]

export function calculateIrpfHonorarios(
  honorariosValue: number,
): IrpfHonorariosResult {
  if (honorariosValue <= 0) {
    return { base: 0, taxDue: 0, effectiveRate: 0 }
  }
  let applicableBracket = IRPF_HONORARIOS_BRACKETS[0]
  for (const bracket of IRPF_HONORARIOS_BRACKETS) {
    if (honorariosValue >= bracket.min) {
      applicableBracket = bracket
    }
  }
  const taxDue = round(
    Math.max(
      0,
      honorariosValue * applicableBracket.rate - applicableBracket.deduction,
    ),
  )
  const effectiveRate =
    honorariosValue > 0 ? round((taxDue / honorariosValue) * 100) : 0
  return { base: honorariosValue, taxDue, effectiveRate }
}
