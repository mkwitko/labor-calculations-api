import type {
  LaborCalculationInput,
  LaborCalculationResult,
} from './labor-calculation'

export type SalaryEntry = {
  month: string
  baseSalary: number
  lastSalary: number
}

export type UnpaidSalaryEntry = {
  month: string
  daysWorked: number
}

export type CorrectedVerb = {
  original: number
  correctionFactor: number
  corrected: number
  correctionAmount: number
}

export type VerbWithInterest = {
  original: number
  corrected: number
  correctionAmount: number
  interest: number
  total: number
}

export type SalaryDifferenceMonthlyEntry = {
  month: string
  due: number
  received: number
  diff: number
  corrected: number
  correctionAmount: number
  interest: number
  total: number
}

export type SalaryDifferenceDetail = {
  monthlyEntries: SalaryDifferenceMonthlyEntry[]
  totalDiff: number
  totalCorrected: number
  totalInterest: number
  reflexo13: number
  reflexoVacation: number
  reflexoAviso: number
}

export type CustomVerbaMonthlyEntry = {
  month: string
  value: number
  corrected: number
  correctionAmount: number
  interest: number
  total: number
}

export type CustomVerbaDetail = {
  name: string
  nature: 'indenizatoria' | 'salarial'
  bruto: number
  corrigido: number
  juros: number
  total: number
  monthlyEntries: CustomVerbaMonthlyEntry[]
}

export type PrescricaoResult = {
  applied: boolean
  cutoffMonth: string
  monthsCut: number
}

export type LaborCalculationResultV3 = LaborCalculationResult & {
  saldoSalarioValue: number

  salaryDifferenceValue: number
  salaryDifferenceReflexosValue: number
  salaryDifferenceDetail?: SalaryDifferenceDetail
  customVerbasDetail: CustomVerbaDetail[]
  outrasVerbasValue: number
  customVerbasReflexosValue: number
  art467Value: number
  intervalIntrajornadaValue: number
  transferAdditionalValue: number
  dsrValue: number
  stabilityValue: number
  deductionsValue: number
  prescricao?: PrescricaoResult

  correction: {
    priorNotice: CorrectedVerb
    thirteenthSalary: CorrectedVerb
    vacation: CorrectedVerb
    art477Fine: CorrectedVerb
    saldoSalario: CorrectedVerb
    salaryMonths: Record<string, CorrectedVerb>
    fgts: CorrectedVerb
    fgtsFine: CorrectedVerb
    salaryDifference: CorrectedVerb
    art467: CorrectedVerb
  }

  interest: {
    priorNotice: number
    thirteenthSalary: number
    vacation: number
    art477Fine: number
    saldoSalario: number
    salaryMonths: Record<string, number>
    fgts: number
    fgtsFine: number
    salaryDifference: number
    customVerbas: number
    total: number
  }

  fgtsDetail: {
    monthlyEntries: {
      month: string
      base: number
      aliquot: number
      deposit: number
      corrected: number
      correctionAmount: number
      interest: number
      total: number
    }[]
    totalDeposit: number
    totalCorrected: number
    totalInterest: number
    totalFgts: number
    fineBase: number
    fineValue: number
    fineCorrected: number
  }

  inssEmployee: number
  inssEmployer: number
  satRat: number

  irpf: number

  custasJudiciais: number
  honorariosSucumbencia: number
  honorariosIrpf: number
  honorariosLiquidos: number

  brutoDevidoReclamante: number
  totalDescontos: number
  liquidoDevidoReclamante: number
  totalDevidoReclamado: number

  percentualRemuneratorio: number

  // Memória de cálculo: uma linha por verba. A soma dos `bruto` fecha com
  // `totalValue` — é o que permite emitir laudo item a item.
  verbasDetalhadas: {
    name: string
    legalRef?: string
    bruto: number
    juros: number
    corrigido: number
    total: number
  }[]
}

export type SalaryDifferencePeriodInput = {
  startMonth: string
  endMonth: string
  dueSalary: number
  receivedSalary?: number
}

export type SalaryDifferenceInput = {
  type: 'equiparacao' | 'desvio_funcao'
  paradigmName?: string
  applyReflexos: boolean
  periods: SalaryDifferencePeriodInput[]
}

export type CustomVerbaInput = {
  name: string
  monthlyValue: number
  startMonth: string
  endMonth: string
  nature: 'indenizatoria' | 'salarial'
}

export type LaborCalculationInputV3 = LaborCalculationInput & {
  salaryHistory?: SalaryEntry[]
  unpaidSalaries?: UnpaidSalaryEntry[]
  filingDate?: Date
  liquidationDate?: Date
  nightAdditionalPercent?: number
  satRate?: number
  employerInssRate?: number
  honorariosRate?: number
  irpfDependents?: number
  applyArt467?: boolean
  applyPrescricaoQuinquenal?: boolean
  salaryDifference?: SalaryDifferenceInput
  customVerbas?: CustomVerbaInput[]
  // Intervalo intrajornada suprimido (CLT art. 71 §4): horas/mês.
  intervalIntrajornadaHours?: number
  // Adicional de transferência (CLT art. 469 §3): meses transferidos (25% base).
  transferAdditionalMonths?: number
  // DSR sobre horas extras/noturno habituais (Súmula 172 TST).
  applyDsrOnExtra?: boolean
  // Estabilidade indenizada (gestante/CIPA/acidentária): meses restantes.
  stabilityMonths?: number
  // Abatimentos: FGTS já depositado na conta vinculada e verbas já pagas (TRCT).
  fgtsAlreadyDeposited?: number
  amountsAlreadyPaid?: number
}
