import { describe, expect, it } from 'vitest'
import {
  calculateCustasJudiciais,
  calculateHonorariosSucumbencia,
} from './court-costs-calculator'

describe('court-costs-calculator', () => {
  describe('calculateCustasJudiciais', () => {
    it('calculates 2% custas on the total', () => {
      const result = calculateCustasJudiciais(10000)
      expect(result.total).toBe(200)
    })

    it('returns piso (R$10.64) for zero value due to minimum', () => {
      const result = calculateCustasJudiciais(0)
      expect(result.total).toBe(10.64)
    })

    it('rounds to 2 decimal places', () => {
      const result = calculateCustasJudiciais(12345.67)
      expect(result.total).toBe(Math.round(12345.67 * 0.02 * 100) / 100)
    })
  })

  describe('calculateHonorariosSucumbencia', () => {
    it('calculates 15% honorários', () => {
      const result = calculateHonorariosSucumbencia(10000, 0.15)
      expect(result.honorarios).toBe(1500)
    })

    it('deducts IRPF from honorários', () => {
      const result = calculateHonorariosSucumbencia(10000, 0.15)
      expect(result.irpf).toBeGreaterThan(0)
      expect(result.liquido).toBeLessThan(result.honorarios)
    })

    it('returns 0 for zero value', () => {
      const result = calculateHonorariosSucumbencia(0, 0.15)
      expect(result.honorarios).toBe(0)
      expect(result.irpf).toBe(0)
      expect(result.liquido).toBe(0)
    })

    it('custom rate works', () => {
      const result = calculateHonorariosSucumbencia(10000, 0.2)
      expect(result.honorarios).toBe(2000)
    })
  })
})
