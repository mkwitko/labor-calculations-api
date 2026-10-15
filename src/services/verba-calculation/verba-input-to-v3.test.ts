import { describe, expect, it } from 'vitest'
import { claimObservation, verbaInputToV3 } from './verba-input-to-v3'

describe('verbaInputToV3', () => {
  it('devolve null na rescisão: o caminho de sempre continua valendo', () => {
    expect(verbaInputToV3('rescisao', {})).toBeNull()
  })

  it('converte horas extras em input do V3 com o total de horas', () => {
    const input = verbaInputToV3('horas_extras', {
      monthlySalary: 3000,
      weeklySchedule: 44,
      extraHoursPerWeek: 5,
      startDate: '2021-01-01T00:00:00.000Z',
      endDate: '2024-12-31T00:00:00.000Z',
    })

    expect(input).not.toBeNull()
    expect(input?.lastSalary).toBe(3000)
    expect(input?.baseSalary).toBe(3000)
    expect(input?.terminationType).toBe('sem_justa_causa')
    expect(input?.applyDsrOnExtra).toBe(true)
    // 5h/semana × 52/12 × 48 meses ≈ 1040h no período.
    expect(input?.extraHours).toBeGreaterThan(1000)
  })

  it('converte férias e 13º, usando hoje quando não há data de saída', () => {
    const input = verbaInputToV3('ferias_13', {
      monthlySalary: 3000,
      startDate: '2021-03-01T00:00:00.000Z',
      vacationVencidasCount: 2,
      unpaid13ths: 1,
    })

    expect(input?.vacationVencidasCount).toBe(2)
    expect(input?.unpaid13ths).toBe(1)
    expect(input?.extraHours).toBe(0)
    expect(input?.endDate.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('a observação diz de qual calculadora veio', () => {
    expect(claimObservation('horas_extras')).toContain('horas extras')
    expect(claimObservation('ferias_13')).toContain('férias')
    expect(claimObservation('rescisao')).toContain('calculadora pública')
  })
})
