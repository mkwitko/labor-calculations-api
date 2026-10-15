import { describe, expect, it } from 'vitest'
import { defaultIndexTable } from '@/services/labor-calculation/index-table'
import { calculateLaborV3 } from '@/services/labor-calculation/labor-calculation-v3'
import { calculateOvertime, type OvertimeInput } from './overtime-calculation'

const base: OvertimeInput = {
  monthlySalary: 3000,
  weeklySchedule: 44,
  extraHoursPerWeek: 5,
  startDate: new Date('2021-01-01T00:00:00.000Z'),
  endDate: new Date('2024-12-31T00:00:00.000Z'),
  referenceDate: new Date('2025-01-15T00:00:00.000Z'),
}

const table = defaultIndexTable

function lineTotal(result: ReturnType<typeof calculateOvertime>, name: string) {
  return result.lines.find((l) => l.name.startsWith(name))?.total ?? 0
}

describe('calculateOvertime', () => {
  it('calcula o principal com divisor 220 na jornada de 44h', () => {
    const result = calculateOvertime({ ...base }, table)

    // 3000/220 = 13,64/h; 5h/semana × 52/12 = 21,67h/mês; × 1,5 = 443,18/mês.
    // 48 meses de 01/2021 a 12/2024, mais correção monetária.
    expect(lineTotal(result, 'Horas Extras')).toBeGreaterThan(21_000)
  })

  it('usa divisor 200 na jornada de 40h, que dá hora mais cara', () => {
    const de44 = calculateOvertime({ ...base }, table)
    const de40 = calculateOvertime({ ...base, weeklySchedule: 40 }, table)

    expect(lineTotal(de40, 'Horas Extras')).toBeGreaterThan(
      lineTotal(de44, 'Horas Extras'),
    )
  })

  it('aplica DSR, reflexos e FGTS sobre as horas extras', () => {
    const result = calculateOvertime({ ...base }, table)

    expect(lineTotal(result, 'DSR')).toBeGreaterThan(0)
    expect(lineTotal(result, 'Reflexo 13º')).toBeGreaterThan(0)
    expect(lineTotal(result, 'Reflexo Férias')).toBeGreaterThan(0)
    expect(lineTotal(result, 'FGTS')).toBeGreaterThan(0)
  })

  it('toda linha é requer_prova: hora extra depende de controle de jornada', () => {
    const result = calculateOvertime({ ...base }, table)

    expect(result.lines.every((l) => l.certainty === 'requer_prova')).toBe(true)
    expect(result.floor).toBe(0)
    expect(result.ceiling).toBeGreaterThan(0)
    expect(result.pending).toHaveLength(result.lines.length)
  })

  it('descarta os meses alcançados pela prescrição quinquenal', () => {
    const longo = calculateOvertime(
      {
        ...base,
        startDate: new Date('2010-01-01T00:00:00.000Z'),
        endDate: new Date('2024-12-31T00:00:00.000Z'),
      },
      table,
    )
    const dentroDoPrazo = calculateOvertime({ ...base }, table)

    // Quinze anos de contrato, mas só os cinco anteriores à referência entram —
    // senão o total seria quase quatro vezes o do contrato de quatro anos.
    expect(lineTotal(longo, 'Horas Extras')).toBeLessThan(
      lineTotal(dentroDoPrazo, 'Horas Extras') * 2,
    )
  })

  it('zera e sinaliza quando a prescrição bienal já correu', () => {
    const result = calculateOvertime(
      {
        ...base,
        startDate: new Date('2015-01-01T00:00:00.000Z'),
        endDate: new Date('2018-12-31T00:00:00.000Z'),
      },
      table,
    )

    expect(result.prescribed).toBe(true)
    expect(result.ceiling).toBe(0)
    expect(result.lines).toHaveLength(0)
  })

  it('bate com o V3 no principal, no DSR e no FGTS reflexo', () => {
    const result = calculateOvertime({ ...base }, table)

    // Total de horas do mesmo cenário: 5h/semana × 52/12 × 48 meses.
    const totalHours = 5 * (52 / 12) * 48

    const v3 = calculateLaborV3(
      {
        clientName: 'Paridade',
        startDate: base.startDate,
        endDate: base.endDate,
        lastSalary: 3000,
        baseSalary: 3000,
        lastThreeSalariesAvg: 3000,
        unpaid13ths: 0,
        vacationCount: 0,
        vacationVencidasCount: 0,
        priorNoticeWorked: false,
        extraHours: totalHours,
        nightHours: 0,
        insalubrityLevel: 0,
        dangerousWork: false,
        terminationType: 'sem_justa_causa',
        applyDsrOnExtra: true,
        // Não muda nada do que se compara aqui (principal, DSR e FGTS reflexo),
        // mas o input do V3 exige.
        applyArt477Fine: false,
      },
      table,
    )

    // O V3 devolve valor nominal por verba; a comparação é sobre o nominal, sem
    // correção monetária, que é o que as duas contas têm em comum.
    expect(result.nominal.principal).toBeCloseTo(v3.extraHoursValue, 0)
    expect(result.nominal.dsr).toBeCloseTo(v3.dsrValue, 0)

    // `reflexoFGTSValue` é opcional no tipo do V3. Afirmar que veio antes de
    // comparar evita que um `undefined` passe por zero.
    const v3Fgts = v3.reflexoFGTSValue
    expect(v3Fgts).toBeDefined()
    expect(result.nominal.fgts).toBeCloseTo(v3Fgts as number, 0)
  })
})
