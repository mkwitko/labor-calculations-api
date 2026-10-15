import { describe, expect, it } from 'vitest'
import { monthRangeKey } from './date-utils'
import { defaultIndexTable, getCorrectionFactor } from './index-table'

describe('index-table', () => {
  describe('getCorrectionFactor', () => {
    it('returns 1 when from and to are the same month', () => {
      const key = monthRangeKey({ year: 2025, month: 1 })
      const factor = getCorrectionFactor(defaultIndexTable, key, key)
      expect(factor).toBe(1)
    })

    it('returns factor > 1 for forward range', () => {
      const fromKey = monthRangeKey({ year: 2025, month: 1 })
      const toKey = monthRangeKey({ year: 2025, month: 3 })
      const factor = getCorrectionFactor(defaultIndexTable, fromKey, toKey)
      expect(factor).toBeGreaterThan(1)
    })

    it('returns 1 when from is after to', () => {
      const fromKey = monthRangeKey({ year: 2025, month: 3 })
      const toKey = monthRangeKey({ year: 2025, month: 1 })
      const factor = getCorrectionFactor(defaultIndexTable, fromKey, toKey)
      expect(factor).toBe(1)
    })

    it('returns 1 for months outside index range', () => {
      const factor = getCorrectionFactor(
        defaultIndexTable,
        '2020-01',
        '2020-03',
      )
      expect(factor).toBe(1)
    })
  })

  describe('defaultIndexTable', () => {
    it('has entries for 2024-01 through 2026-03', () => {
      expect(defaultIndexTable.has('2024-01')).toBe(true)
      expect(defaultIndexTable.has('2026-03')).toBe(true)
    })

    it('each entry has positive cumulative factor', () => {
      for (const [, entry] of defaultIndexTable) {
        expect(entry.ipcaECumulative).toBeGreaterThan(0)
      }
    })
  })
})
