import { describe, expect, it } from 'vitest'
import { calculateInssEmployee, calculateInssEmployer } from './inss-calculator'

describe('inss-calculator', () => {
  describe('calculateInssEmployee', () => {
    it('calculates INSS for salary within first bracket (7.5%)', () => {
      const bases = [{ month: '2025-01', value: 1500 }]
      const result = calculateInssEmployee(bases)
      expect(result.entries.length).toBeGreaterThan(0)
      expect(result.total).toBeGreaterThan(0)
      expect(result.total).toBeLessThan(1500 * 0.09)
    })

    it('progressive rates apply across brackets', () => {
      const bases = [{ month: '2025-01', value: 5000 }]
      const result = calculateInssEmployee(bases)
      const effectiveRate = result.total / 5000
      expect(effectiveRate).toBeGreaterThan(0.075)
      expect(effectiveRate).toBeLessThan(0.14)
    })

    it('caps at teto (R$951.63)', () => {
      const bases = [{ month: '2025-01', value: 20000 }]
      const result = calculateInssEmployee(bases)
      expect(result.total).toBeLessThanOrEqual(951.63)
    })

    it('sums multiple months', () => {
      const bases = [
        { month: '2025-01', value: 2881.72 },
        { month: '2025-02', value: 2881.72 },
      ]
      const result = calculateInssEmployee(bases)
      const singleResult = calculateInssEmployee([
        { month: '2025-01', value: 2881.72 },
      ])
      expect(result.total).toBeCloseTo(singleResult.total * 2, 1)
    })

    it('returns 0 for empty bases', () => {
      const result = calculateInssEmployee([])
      expect(result.total).toBe(0)
    })
  })

  describe('calculateInssEmployer', () => {
    it('calculates 20% employer + SAT', () => {
      const bases = [{ month: '2025-01', value: 2881.72 }]
      const result = calculateInssEmployer(bases, 0.2, 0.03)
      expect(result.totalEmployer).toBeCloseTo(2881.72 * 0.2, 1)
      expect(result.totalSat).toBeCloseTo(2881.72 * 0.03, 1)
    })

    it('returns 0 for empty bases', () => {
      const result = calculateInssEmployer([], 0.2, 0.03)
      expect(result.totalEmployer).toBe(0)
      expect(result.totalSat).toBe(0)
    })
  })
})
