import type {
  LaborCalculationInput,
  LaborCalculationResult,
} from '@/@types/labor-calculation'

import { env } from '@/env'

import {
  calculateAvisoPrevioDays,
  count13thAvos,
  countVacationAvos,
  countWorkedMonths,
  projectEndDate,
  round,
} from './date-utils'

const NIGHT_ADDITIONAL_PERCENT = 20
const DANGEROUS_WORK_RATE = 0.3
const FGTS_FINE_RATE = 0.4
const EXTRA_HOURS_MULTIPLIER = 1.5
const VACATION_THIRD = 4 / 3

function shouldPayPriorNotice(
  isComJustaCausa: boolean,
  priorNoticeWorked: boolean,
) {
  return !isComJustaCausa && !priorNoticeWorked
}

function calculateDangerousWorkValue(
  dangerousWork: boolean,
  baseSalary: number,
  totalMonths: number,
) {
  if (!dangerousWork) {
    return 0
  }

  return round(baseSalary * DANGEROUS_WORK_RATE * totalMonths)
}

function calculatePriorNoticeValue(
  shouldPay: boolean,
  lastSalary: number,
  avisoPrevioDays: number,
) {
  if (!shouldPay) {
    return 0
  }

  return round((lastSalary / 30) * avisoPrevioDays)
}

function calculateUnemploymentInsurance(
  isSemJustaCausa: boolean,
  lastThreeSalariesAvg: number,
) {
  if (!isSemJustaCausa) {
    return 0
  }

  if (lastThreeSalariesAvg <= 2222.17) {
    return round(lastThreeSalariesAvg * 0.8)
  }

  if (lastThreeSalariesAvg <= 3703.99) {
    return round((lastThreeSalariesAvg - 2222.17) * 0.5 + 1777.74)
  }

  return 2518.65
}

function calculateFGTSFineValue(isSemJustaCausa: boolean, fgtsValue: number) {
  if (!isSemJustaCausa) {
    return 0
  }

  return round(fgtsValue * FGTS_FINE_RATE)
}

function calculateReflexoFGTSValue(
  isComJustaCausa: boolean,
  extraHoursValue: number,
  nightAdditionalValue: number,
  fgtsRate: number,
) {
  if (isComJustaCausa) {
    return 0
  }

  return round((extraHoursValue + nightAdditionalValue) * fgtsRate)
}

export function calculateLaborV2(
  input: LaborCalculationInput,
): LaborCalculationResult {
  const {
    startDate,
    endDate,
    lastSalary,
    baseSalary,
    vacationVencidasCount,
    applyArt477Fine,
    priorNoticeWorked,
    extraHours,
    nightHours,
    insalubrityLevel,
    dangerousWork,
    lastThreeSalariesAvg,
    terminationType,
  } = input

  const minimumWage = env.MINIMUM_WAGE
  const fgtsRate = env.FGTS_RATE

  const isSemJustaCausa =
    terminationType === 'sem_justa_causa' ||
    terminationType === 'rescisao_indireta'

  const isComJustaCausa = terminationType === 'com_justa_causa'

  const worked = countWorkedMonths(startDate, endDate)

  const shouldPayNotice = shouldPayPriorNotice(
    isComJustaCausa,
    priorNoticeWorked,
  )

  const avisoPrevioDays = shouldPayNotice
    ? calculateAvisoPrevioDays(worked.years)
    : 0

  const projectedEnd = shouldPayNotice
    ? projectEndDate(endDate, worked.years, priorNoticeWorked)
    : endDate

  const hourlyRate = round(lastSalary / 220)

  const extraHoursValue = round(
    extraHours * hourlyRate * EXTRA_HOURS_MULTIPLIER,
  )

  const nightAdditionalValue = round(
    nightHours * hourlyRate * (1 + NIGHT_ADDITIONAL_PERCENT / 100),
  )

  const insalubrityValue = round(
    minimumWage * (insalubrityLevel / 100) * worked.totalMonths,
  )

  const dangerousWorkValue = calculateDangerousWorkValue(
    dangerousWork,
    baseSalary,
    worked.totalMonths,
  )

  const priorNoticeValue = calculatePriorNoticeValue(
    shouldPayNotice,
    lastSalary,
    avisoPrevioDays,
  )

  const avos13th = isComJustaCausa
    ? 0
    : count13thAvos(startDate, endDate, projectedEnd)

  const thirteenthSalaryValue = round((lastSalary / 12) * avos13th)

  const avosVacation = isComJustaCausa
    ? 0
    : countVacationAvos(startDate, projectedEnd)

  const vacationBase = lastSalary + lastSalary / 3

  const vacationValueProportional = round((vacationBase / 12) * avosVacation)

  const doubleVacationValue = round(vacationVencidasCount * vacationBase)

  const vacationValue = round(vacationValueProportional + doubleVacationValue)

  const fgtsValue = isComJustaCausa
    ? 0
    : round(lastSalary * fgtsRate * worked.totalMonths)

  const fgtsFineValue = calculateFGTSFineValue(isSemJustaCausa, fgtsValue)

  const unemploymentInsuranceValue = calculateUnemploymentInsurance(
    isSemJustaCausa,
    lastThreeSalariesAvg,
  )

  const art477FineValue = applyArt477Fine ? round(lastSalary) : 0

  const hoursAdditionalsMonthly =
    worked.totalMonths > 0
      ? round((extraHoursValue + nightAdditionalValue) / worked.totalMonths)
      : 0

  const reflexo13thValue = isComJustaCausa
    ? 0
    : round(hoursAdditionalsMonthly * (avos13th / 12))

  const paidVacationCount = isComJustaCausa
    ? vacationVencidasCount
    : avosVacation

  const reflexoVacationValue = round(
    hoursAdditionalsMonthly * (paidVacationCount / 12) * VACATION_THIRD,
  )

  const reflexoFGTSValue = calculateReflexoFGTSValue(
    isComJustaCausa,
    extraHoursValue,
    nightAdditionalValue,
    fgtsRate,
  )

  const reflexoMultaFGTSValue = isSemJustaCausa
    ? round(reflexoFGTSValue * FGTS_FINE_RATE)
    : 0

  const totalValue = round(
    priorNoticeValue +
      thirteenthSalaryValue +
      vacationValue +
      fgtsValue +
      fgtsFineValue +
      unemploymentInsuranceValue +
      extraHoursValue +
      nightAdditionalValue +
      insalubrityValue +
      dangerousWorkValue +
      art477FineValue +
      reflexo13thValue +
      reflexoVacationValue +
      reflexoFGTSValue +
      reflexoMultaFGTSValue,
  )

  return {
    priorNoticeValue,
    thirteenthSalaryValue,
    vacationValue,
    fgtsValue,
    fgtsFineValue,
    unemploymentInsuranceValue,
    extraHoursValue,
    nightAdditionalValue,
    insalubrityValue,
    dangerousWorkValue,
    art477FineValue,
    reflexo13thValue,
    reflexoVacationValue,
    reflexoFGTSValue,
    reflexoMultaFGTSValue,
    doubleVacationValue,
    totalValue,
  }
}
