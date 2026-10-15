import type { LaborCalculationInputV3 } from '@/@types/labor-calculation-v3'

/**
 * Reconstrói o input do motor a partir de um cálculo já salvo.
 *
 * Usado por tudo que recalcula sem receber input do usuário: comparação de
 * cenários e reindexação. Precisa ficar num lugar só — duas cópias divergindo
 * fariam o mesmo cálculo dar números diferentes dependendo da tela.
 */

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type StoredCalculation = {
  clientName: string
  clientDocument: string | null
  startDate: Date
  endDate: Date
  lastSalary: unknown
  baseSalary: unknown
  unpaid13ths: number
  vacationCount: number
  vacationVencidasCount: number
  priorNoticeWorked: boolean
  priorNoticeDate: Date | null
  extraHours: unknown
  nightHours: unknown
  insalubrityLevel: number
  dangerousWork: boolean
  lastThreeSalariesAvg: unknown
  terminationType: string
  applyArt477Fine: boolean
  filingDate: Date | null
  liquidationDate: Date | null
  nightAdditionalPercent: number
  satRate: unknown
  employerInssRate: unknown
  honorariosRate: unknown
  irpfDependents: number
  applyArt467: boolean
  applyPrescricaoQuinquenal: boolean
  intervalIntrajornadaHours: number
  transferAdditionalMonths: number
  applyDsrOnExtra: boolean
  stabilityMonths: number
  fgtsAlreadyDeposited: unknown
  amountsAlreadyPaid: unknown
  salaryDifferenceType: string | null
  paradigmName: string | null
  salaryDifferenceApplyReflexos: boolean
  salaryHistory: { month: Date; baseSalary: number; lastSalary: number }[]
  unpaidSalaries: { month: Date; daysWorked: number }[]
  customVerbas: {
    name: string
    monthlyValue: number
    startMonth: Date
    endMonth: Date
    nature: string
  }[]
  salaryDifferencePeriods: {
    startMonth: Date
    endMonth: Date
    dueSalary: number
    receivedSalary: number | null
  }[]
}

export type StoredInputOverrides = {
  applyPrescricaoQuinquenal?: boolean
  applyArt467?: boolean
}

export function buildV3InputFromStored(
  c: StoredCalculation,
  overrides: StoredInputOverrides = {},
): LaborCalculationInputV3 {
  return {
    clientName: c.clientName,
    clientDocument: c.clientDocument ?? undefined,
    startDate: c.startDate,
    endDate: c.endDate,
    lastSalary: Number(c.lastSalary),
    baseSalary: Number(c.baseSalary),
    unpaid13ths: c.unpaid13ths,
    vacationCount: c.vacationCount,
    vacationVencidasCount: c.vacationVencidasCount,
    priorNoticeWorked: c.priorNoticeWorked,
    priorNoticeDate: c.priorNoticeDate ?? undefined,
    extraHours: Number(c.extraHours),
    nightHours: Number(c.nightHours),
    insalubrityLevel: c.insalubrityLevel as 0 | 10 | 20 | 40,
    dangerousWork: c.dangerousWork,
    lastThreeSalariesAvg: Number(c.lastThreeSalariesAvg),
    terminationType:
      c.terminationType as LaborCalculationInputV3['terminationType'],
    applyArt477Fine: c.applyArt477Fine,
    filingDate: c.filingDate ?? undefined,
    liquidationDate: c.liquidationDate ?? undefined,
    nightAdditionalPercent: c.nightAdditionalPercent,
    satRate: Number(c.satRate),
    employerInssRate: Number(c.employerInssRate),
    honorariosRate: Number(c.honorariosRate),
    irpfDependents: c.irpfDependents,
    applyArt467: overrides.applyArt467 ?? c.applyArt467,
    applyPrescricaoQuinquenal:
      overrides.applyPrescricaoQuinquenal ?? c.applyPrescricaoQuinquenal,
    intervalIntrajornadaHours: c.intervalIntrajornadaHours,
    transferAdditionalMonths: c.transferAdditionalMonths,
    applyDsrOnExtra: c.applyDsrOnExtra,
    stabilityMonths: c.stabilityMonths,
    fgtsAlreadyDeposited: Number(c.fgtsAlreadyDeposited),
    amountsAlreadyPaid: Number(c.amountsAlreadyPaid),
    salaryHistory: c.salaryHistory.map((s) => ({
      month: monthKey(s.month),
      baseSalary: s.baseSalary,
      lastSalary: s.lastSalary,
    })),
    unpaidSalaries: c.unpaidSalaries.map((u) => ({
      month: monthKey(u.month),
      daysWorked: u.daysWorked,
    })),
    customVerbas: c.customVerbas.map((v) => ({
      name: v.name,
      monthlyValue: v.monthlyValue,
      startMonth: monthKey(v.startMonth),
      endMonth: monthKey(v.endMonth),
      nature: v.nature as 'salarial' | 'indenizatoria',
    })),
    salaryDifference:
      c.salaryDifferenceType && c.salaryDifferencePeriods.length > 0
        ? {
            type: c.salaryDifferenceType as NonNullable<
              LaborCalculationInputV3['salaryDifference']
            >['type'],
            paradigmName: c.paradigmName ?? undefined,
            applyReflexos: c.salaryDifferenceApplyReflexos,
            periods: c.salaryDifferencePeriods.map((p) => ({
              startMonth: monthKey(p.startMonth),
              endMonth: monthKey(p.endMonth),
              dueSalary: p.dueSalary,
              receivedSalary: p.receivedSalary ?? undefined,
            })),
          }
        : undefined,
  }
}
