import { describe, expect, it } from 'vitest'
import { calculateIrpfAcumulado } from './irpf-calculator'

describe('irpf-calculator', () => {
  it('returns 0 tax for income below annual exemption', () => {
    const result = calculateIrpfAcumulado(10000, 0, 0)
    expect(result.taxDue).toBe(0)
  })

  it('calculates tax for high annual income', () => {
    const result = calculateIrpfAcumulado(30000, 500, 0)
    expect(result.taxDue).toBeGreaterThan(0)
  })

  it('deducts INSS from base', () => {
    const noInss = calculateIrpfAcumulado(30000, 0, 0)
    const withInss = calculateIrpfAcumulado(30000, 500, 0)
    expect(withInss.taxDue).toBeLessThanOrEqual(noInss.taxDue)
  })

  it('applies dependent deduction', () => {
    const noDep = calculateIrpfAcumulado(30000, 0, 0)
    const withDep = calculateIrpfAcumulado(30000, 0, 2)
    expect(withDep.taxDue).toBeLessThanOrEqual(noDep.taxDue)
  })

  it('returns 0 for zero income', () => {
    const result = calculateIrpfAcumulado(0, 0, 0)
    expect(result.taxDue).toBe(0)
  })

  it('exempts income at annual R$12144 or below', () => {
    const result = calculateIrpfAcumulado(12144, 0, 0)
    expect(result.taxDue).toBe(0)
  })

  it('taxes income above R$12144', () => {
    const result = calculateIrpfAcumulado(15000, 0, 0)
    expect(result.taxDue).toBeGreaterThan(0)
  })
})
