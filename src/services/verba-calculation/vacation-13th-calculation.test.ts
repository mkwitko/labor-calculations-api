import { describe, expect, it } from 'vitest'
import { defaultIndexTable } from '@/services/labor-calculation/index-table'
import {
  calculateVacationAnd13th,
  type VacationAnd13thInput,
} from './vacation-13th-calculation'

const base: VacationAnd13thInput = {
  monthlySalary: 3000,
  startDate: new Date('2021-03-01T00:00:00.000Z'),
  vacationVencidasCount: 1,
  unpaid13ths: 0,
  referenceDate: new Date('2024-09-15T00:00:00.000Z'),
}

const table = defaultIndexTable

function lineTotal(
  result: ReturnType<typeof calculateVacationAnd13th>,
  name: string,
) {
  return result.lines.find((l) => l.name.startsWith(name))?.total ?? 0
}

describe('calculateVacationAnd13th', () => {
  it('paga férias vencidas com o terço constitucional', () => {
    const result = calculateVacationAnd13th({ ...base }, table)

    // 3000 × 4/3 = 4000 nominal, mais correção — nunca menos que o nominal.
    expect(lineTotal(result, 'Férias Vencidas')).toBeGreaterThanOrEqual(4000)
  })

  it('acrescenta a dobra do art. 137 no período fora do prazo', () => {
    const result = calculateVacationAnd13th({ ...base }, table)

    expect(lineTotal(result, 'Dobra')).toBeGreaterThan(0)
  })

  it('calcula proporcionais e 13º sobre o período em curso', () => {
    const result = calculateVacationAnd13th({ ...base }, table)

    expect(lineTotal(result, 'Férias Proporcionais')).toBeGreaterThan(0)
    expect(lineTotal(result, '13º Salário Proporcional')).toBeGreaterThan(0)
  })

  it('soma os 13º atrasados informados', () => {
    const semAtraso = calculateVacationAnd13th({ ...base }, table)
    const comAtraso = calculateVacationAnd13th(
      { ...base, unpaid13ths: 2 },
      table,
    )

    expect(comAtraso.ceiling).toBeGreaterThan(semAtraso.ceiling + 5000)
  })

  it('usa a data de saída quando a pessoa não trabalha mais lá', () => {
    const aindaTrabalha = calculateVacationAnd13th({ ...base }, table)
    const saiuAntes = calculateVacationAnd13th(
      { ...base, endDate: new Date('2023-03-01T00:00:00.000Z') },
      table,
    )

    expect(saiuAntes.ceiling).toBeLessThan(aindaTrabalha.ceiling)
  })

  it('férias e 13º são documentais; a dobra depende de prova', () => {
    const result = calculateVacationAnd13th({ ...base }, table)

    const dobra = result.lines.find((l) => l.name.startsWith('Dobra'))
    const vencidas = result.lines.find((l) =>
      l.name.startsWith('Férias Vencidas'),
    )

    expect(dobra?.certainty).toBe('requer_prova')
    expect(vencidas?.certainty).toBe('documental')
    expect(result.floor).toBeGreaterThan(0)
    expect(result.floor).toBeLessThan(result.ceiling)
  })

  it('zera e sinaliza quando a prescrição bienal já correu', () => {
    const result = calculateVacationAnd13th(
      {
        ...base,
        endDate: new Date('2020-01-01T00:00:00.000Z'),
      },
      table,
    )

    expect(result.prescribed).toBe(true)
    expect(result.ceiling).toBe(0)
  })
})
