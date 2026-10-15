import type { LaborCalculationInputV3 } from '@/@types/labor-calculation-v3'
import { countWorkedMonths } from '@/services/labor-calculation/date-utils'

const WEEKS_PER_MONTH = 52 / 12

/**
 * O advogado que importa um cálculo de verba isolada não recebe uma liquidação
 * pronta — recebe uma liquidação V3 com o que a pessoa respondeu já preenchido e
 * o resto em branco, para completar. Manter um caminho só de importação vale
 * mais que a precisão de um formulário que ele vai revisar de qualquer jeito.
 *
 * Devolve `null` na rescisão, onde o input gravado já tem a forma do motor.
 */
export function verbaInputToV3(
  kind: string,
  raw: unknown,
): LaborCalculationInputV3 | null {
  if (kind === 'horas_extras') return fromOvertime(raw)
  if (kind === 'ferias_13') return fromVacation13th(raw)
  return null
}

function fromOvertime(raw: unknown): LaborCalculationInputV3 {
  const input = raw as {
    monthlySalary: number
    weeklySchedule: 44 | 40
    extraHoursPerWeek: number
    startDate: string
    endDate: string
  }

  const startDate = new Date(input.startDate)
  const endDate = new Date(input.endDate)
  const { totalMonths } = countWorkedMonths(startDate, endDate)

  return {
    ...baseInput(input.monthlySalary, startDate, endDate),
    // O motor V3 lê `extraHours` como total do período, não como média mensal.
    extraHours: Math.round(
      input.extraHoursPerWeek * WEEKS_PER_MONTH * totalMonths,
    ),
    applyDsrOnExtra: true,
  }
}

function fromVacation13th(raw: unknown): LaborCalculationInputV3 {
  const input = raw as {
    monthlySalary: number
    startDate: string
    endDate?: string
    vacationVencidasCount: number
    unpaid13ths: number
  }

  const startDate = new Date(input.startDate)
  const endDate = input.endDate ? new Date(input.endDate) : new Date()

  return {
    ...baseInput(input.monthlySalary, startDate, endDate),
    vacationVencidasCount: input.vacationVencidasCount,
    unpaid13ths: input.unpaid13ths,
  }
}

function baseInput(
  salary: number,
  startDate: Date,
  endDate: Date,
): LaborCalculationInputV3 {
  return {
    clientName: 'Consulta pública',
    startDate,
    endDate,
    lastSalary: salary,
    baseSalary: salary,
    lastThreeSalariesAvg: salary,
    unpaid13ths: 0,
    vacationCount: 0,
    vacationVencidasCount: 0,
    priorNoticeWorked: false,
    extraHours: 0,
    nightHours: 0,
    insalubrityLevel: 0,
    dangerousWork: false,
    // Default do formulário, e o campo que o advogado mais ajusta. Uma verba
    // isolada não diz como o contrato terminou — nem se terminou.
    terminationType: 'sem_justa_causa',
    applyArt477Fine: false,
    applyArt467: false,
  }
}

export function claimObservation(kind: string): string {
  if (kind === 'horas_extras') {
    return 'Importado da calculadora pública de horas extras. Só jornada e salário vieram preenchidos; confira o motivo da saída e as demais verbas antes de usar em processo.'
  }

  if (kind === 'ferias_13') {
    return 'Importado da calculadora pública de férias e 13º. Só período, salário e as pendências informadas vieram preenchidos; confira o motivo da saída e as demais verbas antes de usar em processo.'
  }

  return 'Importado da calculadora pública. O cliente respondeu em linguagem comum; confira jornada, adicionais e verbas pagas antes de usar em processo.'
}
