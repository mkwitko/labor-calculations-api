import {
  addMonths,
  generateMonthRange,
  monthRangeKey,
  parseMonthRangeKey,
  round,
  toMonthRange,
} from '@/services/labor-calculation/date-utils'
import type { IndexTable } from '@/services/labor-calculation/index-table'
import {
  calculateAdc58InterestRate,
  defaultIndexTable,
} from '@/services/labor-calculation/index-table'
import { correctMonthlyValues } from '@/services/labor-calculation/monetary-correction'
import {
  filterMonthEntries,
  getPrescricaoCutoffKey,
} from '@/services/labor-calculation/prescription'
import {
  buildVerbaResult,
  type VerbaLine,
  type VerbaResult,
} from './verba-result'

/** Bumpar sempre que a conta mudar: fica gravado em `PublicCalculation`. */
export const OVERTIME_ENGINE_VERSION = 'verba-overtime@1.0.0'

/** Semanas por mês: 52/12. Evita o 4,0 que subestima quase 8%. */
const WEEKS_PER_MONTH = 52 / 12

/** Súmula 172 do TST. Mesmo fator do V3, por paridade. */
const DSR_FACTOR = 0.1818

/** Lei 8.036/1990, art. 15. Mesma alíquota que o V3 aplica no reflexo. */
const FGTS_RATE = 0.08

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

export type OvertimeInput = {
  monthlySalary: number
  /** 44h/semana → divisor 220; 40h/semana → divisor 200 (CLT art. 64). */
  weeklySchedule: 44 | 40
  extraHoursPerWeek: number
  startDate: Date
  endDate: Date
  /** Data-base da prescrição e mês de liquidação. Default: hoje. */
  referenceDate?: Date
}

export type OvertimeResult = VerbaResult & {
  /**
   * Valores sem correção monetária, por verba. Existem para o teste de paridade
   * com o V3, que devolve nominal — e para a tela poder mostrar a diferença
   * entre o devido e o corrigido, se um dia quiser.
   */
  nominal: {
    principal: number
    dsr: number
    reflexo13th: number
    reflexoVacation: number
    fgts: number
  }
}

export function calculateOvertime(
  input: OvertimeInput,
  table: IndexTable = defaultIndexTable,
): OvertimeResult {
  const reference = input.referenceDate ?? new Date()

  // Prescrição bienal (CF art. 7º, XXIX): passados dois anos do fim do contrato
  // não há mais o que pedir, por maior que fosse a jornada.
  const prescribed =
    reference.getTime() - input.endDate.getTime() > 2 * MS_PER_YEAR

  if (prescribed) {
    return { ...buildVerbaResult([], true), nominal: zeroNominal() }
  }

  const divisor = input.weeklySchedule === 44 ? 220 : 200
  const hourlyRate = round(input.monthlySalary / divisor)
  const monthlyExtraHours = input.extraHoursPerWeek * WEEKS_PER_MONTH

  // Uma entrada por mês do período, para a correção monetária poder aplicar o
  // índice de cada mês — é o que separa este cálculo de uma multiplicação.
  const months = generateMonthRange(
    toMonthRange(input.startDate),
    toMonthRange(input.endDate),
  )

  const cutoffKey = getPrescricaoCutoffKey(reference)
  const monthlyPrincipal = filterMonthEntries(
    months.map((month) => ({
      month: monthRangeKey(month),
      value: round(monthlyExtraHours * hourlyRate * 1.5),
    })),
    cutoffKey,
  )

  if (monthlyPrincipal.length === 0) {
    return { ...buildVerbaResult([], false), nominal: zeroNominal() }
  }

  const monthlyDsr = monthlyPrincipal.map((entry) => ({
    month: entry.month,
    value: round(entry.value * DSR_FACTOR),
  }))

  const liquidationMonth = toMonthRange(reference)

  const principal = correctAndAccrue(monthlyPrincipal, table, liquidationMonth)
  const dsr = correctAndAccrue(monthlyDsr, table, liquidationMonth)

  // Reflexos com a fórmula do V3 (labor-calculation-v3.ts:316-337), aplicada por
  // ano do período em vez de só no ano da saída: aqui não há rescisão que já
  // tenha pago o 13º e as férias dos anos anteriores.
  const reflexoBase = principal.corrected + dsr.corrected
  const reflexo13th = round(reflexoBase / 12)
  const reflexoVacation = round((reflexoBase / 12) * (4 / 3))
  // Igual ao V3: a alíquota incide só sobre as horas extras, sem o DSR e sem os
  // reflexos na base.
  const fgts = round(principal.corrected * FGTS_RATE)

  const lines: VerbaLine[] = [
    {
      name: 'Horas Extras (50%)',
      legalRef: 'CLT, art. 59; CF, art. 7º, XVI',
      total: principal.corrected,
      certainty: 'requer_prova',
    },
    {
      name: 'DSR sobre Horas Extras',
      legalRef: 'Súmula 172 do TST; Lei 605/1949',
      total: dsr.corrected,
      certainty: 'requer_prova',
    },
    {
      name: 'Reflexo 13º Salário',
      legalRef: 'Súmula 45 do TST',
      total: reflexo13th,
      certainty: 'requer_prova',
    },
    {
      name: 'Reflexo Férias + 1/3',
      legalRef: 'Súmula 151 do TST; CF, art. 7º, XVII',
      total: reflexoVacation,
      certainty: 'requer_prova',
    },
    {
      name: 'FGTS 8% sobre Horas Extras',
      legalRef: 'Súmula 63 do TST; Lei 8.036/1990, art. 15',
      total: fgts,
      certainty: 'requer_prova',
    },
  ]

  return {
    ...buildVerbaResult(lines, false),
    nominal: {
      principal: principal.nominal,
      dsr: dsr.nominal,
      reflexo13th: round((principal.nominal + dsr.nominal) / 12),
      reflexoVacation: round(
        ((principal.nominal + dsr.nominal) / 12) * (4 / 3),
      ),
      fgts: round(principal.nominal * FGTS_RATE),
    },
  }
}

function zeroNominal(): OvertimeResult['nominal'] {
  return {
    principal: 0,
    dsr: 0,
    reflexo13th: 0,
    reflexoVacation: 0,
    fgts: 0,
  }
}

/**
 * Corrige mês a mês pelo índice do período (IPCA-E + TR até 12/2024, SELIC
 * depois — ADC 58) e soma os juros de cada parcela. O nominal volta junto porque
 * é o que se compara com o V3.
 */
function correctAndAccrue(
  monthly: { month: string; value: number }[],
  table: IndexTable,
  liquidationMonth: { year: number; month: number },
): { nominal: number; corrected: number } {
  const nominal = round(monthly.reduce((sum, e) => sum + e.value, 0))
  const corrected = correctMonthlyValues(monthly, table, liquidationMonth)
  const liquidKey = monthRangeKey(liquidationMonth)

  const total = corrected.reduce((sum, entry) => {
    const dueKey = monthRangeKey(addMonths(parseMonthRangeKey(entry.month), 1))
    const rate = calculateAdc58InterestRate(table, dueKey, liquidKey)
    return sum + entry.corrected + entry.corrected * rate
  }, 0)

  return { nominal, corrected: round(total) }
}
