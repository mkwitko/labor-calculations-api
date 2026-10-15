import { describe, expect, it } from 'vitest'
import { defaultIndexTable } from './index-table'
import { correctMonthlyValues, correctValue } from './monetary-correction'

describe('monetary-correction', () => {
  describe('correctValue', () => {
    it('returns same value when from and to are same month', () => {
      const result = correctValue(
        1000,
        defaultIndexTable,
        { year: 2025, month: 1 },
        { year: 2025, month: 1 },
      )
      expect(result.original).toBe(1000)
      expect(result.corrected).toBe(1000)
      expect(result.correctionAmount).toBe(0)
    })

    it('corrects value forward in time', () => {
      const result = correctValue(
        1000,
        defaultIndexTable,
        { year: 2025, month: 1 },
        { year: 2025, month: 3 },
      )
      expect(result.corrected).toBeGreaterThan(1000)
      expect(result.correctionFactor).toBeGreaterThan(1)
      expect(result.correctionAmount).toBeGreaterThan(0)
    })

    it('returns original when no index data exists', () => {
      const result = correctValue(
        1000,
        defaultIndexTable,
        { year: 2020, month: 1 },
        { year: 2020, month: 3 },
      )
      expect(result.corrected).toBe(1000)
      expect(result.correctionAmount).toBe(0)
    })
  })

  describe('correctMonthlyValues', () => {
    it('corrects each entry from its own month', () => {
      const entries = [
        { month: '2025-01', value: 2881.72 },
        { month: '2025-02', value: 2881.72 },
      ]
      const results = correctMonthlyValues(entries, defaultIndexTable, {
        year: 2025,
        month: 3,
      })
      expect(results).toHaveLength(2)
      expect(results[0].correctionFactor).toBeGreaterThan(1)
      expect(results[0].corrected).toBeGreaterThan(2881.72)
      expect(results[1].corrected).toBeGreaterThanOrEqual(2881.72)
    })

    it('returns empty array for empty input', () => {
      const results = correctMonthlyValues([], defaultIndexTable, {
        year: 2025,
        month: 3,
      })
      expect(results).toHaveLength(0)
    })
  })
})
