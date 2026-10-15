export type LaborCalculationInput = {
  clientName: string
  clientId?: string
  clientDocument?: string
  observations?: string
  startDate: Date
  endDate: Date

  lastSalary: number
  baseSalary: number

  unpaid13ths: number
  vacationCount: number
  vacationVencidasCount: number

  priorNoticeWorked: boolean
  priorNoticeDate?: Date

  extraHours: number
  nightHours: number

  insalubrityLevel: 0 | 10 | 20 | 40
  dangerousWork: boolean

  lastThreeSalariesAvg: number

  terminationType:
    | 'sem_justa_causa'
    | 'com_justa_causa'
    | 'pedido_demissao'
    | 'rescisao_indireta'

  applyArt477Fine: boolean

  status?: 'em_andamento' | 'proposta_enviada' | 'acordo_fechado' | 'ajuizado'
}

export type BaseValues = {
  minimumWage: number
  fgtsRate: number
}

export type LaborCalculationResult = {
  priorNoticeValue: number
  thirteenthSalaryValue: number
  vacationValue: number
  fgtsValue: number
  fgtsFineValue: number
  unemploymentInsuranceValue: number
  extraHoursValue: number
  nightAdditionalValue: number
  insalubrityValue: number
  dangerousWorkValue: number
  totalValue: number
  art477FineValue?: number
  reflexo13thValue?: number
  reflexoVacationValue?: number
  reflexoFGTSValue?: number
  reflexoMultaFGTSValue?: number
  doubleVacationValue?: number
}

export type CorrectedVerb = {
  verbName: string
  original: number
  correctionFactor: number
  corrected: number
  correctionAmount: number
}

export type VerbWithInterest = {
  verbName: string
  original: number
  corrected: number
  correctionAmount: number
  interest: number
  total: number
}

export type FgtsEntryRow = {
  month: Date
  base: number
  aliquot: number
  deposit: number
  corrected: number
  correctionAmount: number
  interest: number
  total: number
}
