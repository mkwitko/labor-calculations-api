import {
  countAvos,
  monthRangeKey,
  round,
  toMonthRange,
} from '@/services/labor-calculation/date-utils'
import type { IndexTable } from '@/services/labor-calculation/index-table'
import {
  calculateAdc58InterestRate,
  defaultIndexTable,
} from '@/services/labor-calculation/index-table'
import { correctValue } from '@/services/labor-calculation/monetary-correction'
import {
  buildVerbaResult,
  type VerbaLine,
  type VerbaResult,
} from './verba-result'

export const VACATION_13TH_ENGINE_VERSION = 'verba-ferias13@1.0.0'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

export type VacationAnd13thInput = {
  monthlySalary: number
  startDate: Date
  /** Ausente quando a pessoa ainda trabalha na empresa. */
  endDate?: Date
  vacationVencidasCount: number
  unpaid13ths: number
  referenceDate?: Date
}

export function calculateVacationAnd13th(
  input: VacationAnd13thInput,
  table: IndexTable = defaultIndexTable,
): VerbaResult {
  const reference = input.referenceDate ?? new Date()
  const until = input.endDate ?? reference

  const prescribed =
    Boolean(input.endDate) &&
    reference.getTime() - until.getTime() > 2 * MS_PER_YEAR

  if (prescribed) return buildVerbaResult([], true)

  const salary = input.monthlySalary
  const liquidationMonth = toMonthRange(reference)
  const dueMonth = toMonthRange(until)

  // Cada verba é corrigida do mês em que era devida até o mês da liquidação,
  // com os juros da ADC 58 sobre o valor já corrigido — mesma ordem do V3.
  const bring = (value: number): number => {
    if (value <= 0) return 0
    const corrected = correctValue(value, table, dueMonth, liquidationMonth)
    const rate = calculateAdc58InterestRate(
      table,
      monthRangeKey(dueMonth),
      monthRangeKey(liquidationMonth),
    )
    return round(corrected.corrected * (1 + rate))
  }

  const lines: VerbaLine[] = []

  // ─── Férias vencidas + 1/3 (CF art. 7º, XVII; CLT arts. 129 e 146) ──────────
  const vencidasValue = input.vacationVencidasCount * salary * (4 / 3)
  if (vencidasValue > 0) {
    lines.push({
      name: 'Férias Vencidas + 1/3',
      legalRef: 'CLT, arts. 129 e 146; CF, art. 7º, XVII',
      total: bring(round(vencidasValue)),
      certainty: 'documental',
    })

    // Dobra do art. 137: devida quando o período concessivo de 12 meses passou
    // sem gozo. Um período vencido em aberto já significa que passou.
    lines.push({
      name: 'Dobra do Art. 137 da CLT',
      legalRef: 'CLT, art. 137; Súmula 81 do TST',
      total: bring(round(vencidasValue)),
      certainty: 'requer_prova',
    })
  }

  // ─── Férias proporcionais + 1/3 ─────────────────────────────────────────────
  const vacationAvos = Math.min(
    countAvosInCurrentPeriod(input.startDate, until),
    12,
  )
  const proportionalVacation = (salary / 12) * vacationAvos * (4 / 3)
  if (proportionalVacation > 0) {
    lines.push({
      name: 'Férias Proporcionais + 1/3',
      legalRef: 'CLT, art. 146, parágrafo único; Súmula 261 do TST',
      total: bring(round(proportionalVacation)),
      certainty: 'documental',
    })
  }

  // ─── 13º proporcional (Lei 4.090/1962) ──────────────────────────────────────
  // Avos do ano-calendário de referência: mês com mais de 14 dias conta inteiro.
  const yearStart = new Date(Date.UTC(until.getUTCFullYear(), 0, 1))
  const from = input.startDate > yearStart ? input.startDate : yearStart
  const avos13th = Math.min(countAvos(from, until), 12)
  const proportional13th = (salary / 12) * avos13th
  if (proportional13th > 0) {
    lines.push({
      name: '13º Salário Proporcional',
      legalRef: 'Lei 4.090/1962, art. 1º, §1º',
      total: bring(round(proportional13th)),
      certainty: 'documental',
    })
  }

  // ─── 13º não pagos ──────────────────────────────────────────────────────────
  if (input.unpaid13ths > 0) {
    lines.push({
      name: '13º Salário em Atraso',
      legalRef: 'Lei 4.090/1962; CF, art. 7º, VIII',
      total: bring(round(input.unpaid13ths * salary)),
      certainty: 'documental',
    })
  }

  return buildVerbaResult(lines, false)
}

/**
 * Avos do período aquisitivo em curso: conta a partir do último aniversário de
 * admissão, não da admissão. Quem tem quatro anos de casa não acumula 48 avos de
 * férias proporcionais — os períodos fechados viraram férias vencidas ou gozadas.
 */
function countAvosInCurrentPeriod(startDate: Date, until: Date): number {
  const anniversary = new Date(startDate)
  while (anniversary.getTime() <= until.getTime()) {
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1)
  }
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() - 1)

  return Math.max(countAvos(anniversary, until), 0)
}
