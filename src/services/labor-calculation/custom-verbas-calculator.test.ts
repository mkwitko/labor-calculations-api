import { describe, expect, it } from 'vitest'
import { calculateCustomVerbas } from './custom-verbas-calculator'
import { toMonthRange } from './date-utils'
import { defaultIndexTable } from './index-table'

const liquidationMonth = toMonthRange(new Date('2026-03-31'))

describe('custom-verbas-calculator', () => {
  it('multiplies the monthly value across the period with correction and interest', () => {
    const result = calculateCustomVerbas(
      [
        {
          name: 'Vale-alimentação não pago',
          monthlyValue: 300,
          startMonth: '2025-01',
          endMonth: '2025-06',
          nature: 'indenizatoria',
        },
      ],
      defaultIndexTable,
      liquidationMonth,
      undefined,
    )
    expect(result.details).toHaveLength(1)
    expect(result.details[0].monthlyEntries).toHaveLength(6)
    expect(result.details[0].bruto).toBe(1800)
    expect(result.totalBruto).toBe(1800)
    expect(result.details[0].corrigido).toBeGreaterThanOrEqual(1800)
    expect(result.details[0].juros).toBeGreaterThan(0)
    expect(result.details[0].total).toBe(
      Math.round(
        (result.details[0].corrigido + result.details[0].juros) * 100,
      ) / 100,
    )
  })

  it('feeds salarial-nature months into salarialByMonth; indenizatória does not', () => {
    const result = calculateCustomVerbas(
      [
        {
          name: 'Comissões',
          monthlyValue: 400,
          startMonth: '2025-01',
          endMonth: '2025-03',
          nature: 'salarial',
        },
        {
          name: 'Multa convencional',
          monthlyValue: 100,
          startMonth: '2025-01',
          endMonth: '2025-03',
          nature: 'indenizatoria',
        },
      ],
      defaultIndexTable,
      liquidationMonth,
      undefined,
    )
    expect(result.salarialByMonth).toEqual({
      '2025-01': 400,
      '2025-02': 400,
      '2025-03': 400,
    })
    expect(result.salarialMonthlyAverage).toBe(400)
    expect(result.totalBruto).toBe(1500)
  })

  it('accumulates overlapping salarial verbas in the same month', () => {
    const result = calculateCustomVerbas(
      [
        {
          name: 'Comissões',
          monthlyValue: 400,
          startMonth: '2025-01',
          endMonth: '2025-02',
          nature: 'salarial',
        },
        {
          name: 'Prêmio habitual',
          monthlyValue: 200,
          startMonth: '2025-02',
          endMonth: '2025-03',
          nature: 'salarial',
        },
      ],
      defaultIndexTable,
      liquidationMonth,
      undefined,
    )
    expect(result.salarialByMonth['2025-02']).toBe(600)
  })

  it('applies the prescription cutoff per month', () => {
    const result = calculateCustomVerbas(
      [
        {
          name: 'Adicional',
          monthlyValue: 250,
          startMonth: '2025-01',
          endMonth: '2025-06',
          nature: 'indenizatoria',
        },
      ],
      defaultIndexTable,
      liquidationMonth,
      '2025-04',
    )
    expect(result.details[0].monthlyEntries.map((e) => e.month)).toEqual([
      '2025-04',
      '2025-05',
      '2025-06',
    ])
    expect(result.details[0].bruto).toBe(750)
  })
})
