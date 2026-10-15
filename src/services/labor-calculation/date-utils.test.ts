import { describe, expect, it } from 'vitest'
import {
  calculateAvisoPrevioDays,
  countAvos,
  countWorkedMonths,
  daysInMonth,
  generateMonthRange,
  monthRangeKey,
  projectEndDate,
  toMonthRange,
} from './date-utils'

describe('date-utils', () => {
  describe('toMonthRange', () => {
    it('converts a Date to MonthRange', () => {
      const mr = toMonthRange(new Date('2025-03-15'))
      expect(mr).toEqual({ year: 2025, month: 3 })
    })

    it('handles first day of month', () => {
      const d = new Date(2024, 11, 1)
      const mr = toMonthRange(d)
      expect(mr).toEqual({ year: 2024, month: 12 })
    })
  })

  describe('monthRangeKey', () => {
    it('formats as YYYY-MM', () => {
      expect(monthRangeKey({ year: 2025, month: 3 })).toBe('2025-03')
      expect(monthRangeKey({ year: 2024, month: 12 })).toBe('2024-12')
    })
  })

  describe('countWorkedMonths', () => {
    it('counts months from court case: 04/12/2024 to 14/11/2025', () => {
      const result = countWorkedMonths(
        new Date('2024-12-04'),
        new Date('2025-11-14'),
      )
      expect(result.totalMonths).toBeCloseTo(11.33, 0)
      expect(result.years).toBe(0)
    })

    it('counts 1 year + months', () => {
      const result = countWorkedMonths(
        new Date('2023-06-01'),
        new Date('2025-03-15'),
      )
      expect(result.years).toBe(1)
      expect(result.totalMonths).toBeGreaterThan(20)
    })

    it('same month returns fractional', () => {
      const result = countWorkedMonths(
        new Date('2025-01-15'),
        new Date('2025-01-20'),
      )
      expect(result.totalMonths).toBeGreaterThan(0)
      expect(result.totalMonths).toBeLessThan(1)
    })
  })

  describe('calculateAvisoPrevioDays', () => {
    it('0 years = 30 days', () => {
      expect(calculateAvisoPrevioDays(0)).toBe(30)
    })

    it('1 year = 33 days', () => {
      expect(calculateAvisoPrevioDays(1)).toBe(33)
    })

    it('10 years = 60 days (cap)', () => {
      expect(calculateAvisoPrevioDays(10)).toBe(60)
    })

    it('20 years = 90 days (cap)', () => {
      expect(calculateAvisoPrevioDays(20)).toBe(90)
    })
  })

  describe('projectEndDate', () => {
    it('projects end date with aviso prévio indenizado (not cumprido)', () => {
      const projected = projectEndDate(new Date('2025-11-14'), 0, false)
      const mr = toMonthRange(projected)
      expect(mr.month).toBe(12)
      expect(mr.year).toBe(2025)
    })

    it('aviso prévio cumprido returns same date', () => {
      const projected = projectEndDate(new Date('2025-11-14'), 0, true)
      expect(projected).toEqual(new Date('2025-11-14'))
    })
  })

  describe('countAvos', () => {
    it('counts avos for 11 months + aviso prévio projection', () => {
      const avos = countAvos(new Date('2024-12-04'), new Date('2025-12-13'))
      expect(avos).toBe(13)
    })

    it('counts 1 avo for same month', () => {
      const avos = countAvos(new Date('2025-01-15'), new Date('2025-01-20'))
      expect(avos).toBe(1)
    })

    it('counts 12 avos for a full year', () => {
      const avos = countAvos(new Date('2025-01-01'), new Date('2025-12-31'))
      expect(avos).toBe(12)
    })
  })

  describe('generateMonthRange', () => {
    it('generates months between two dates', () => {
      const months = generateMonthRange(
        { year: 2024, month: 12 },
        { year: 2025, month: 2 },
      )
      expect(months).toHaveLength(3)
      expect(months[0]).toEqual({ year: 2024, month: 12 })
      expect(months[2]).toEqual({ year: 2025, month: 2 })
    })
  })

  describe('daysInMonth', () => {
    it('returns correct days for each month', () => {
      expect(daysInMonth(2025, 1)).toBe(31)
      expect(daysInMonth(2025, 2)).toBe(28)
      expect(daysInMonth(2024, 2)).toBe(29)
      expect(daysInMonth(2025, 4)).toBe(30)
    })
  })
})
