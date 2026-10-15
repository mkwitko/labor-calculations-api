import { describe, expect, it } from 'vitest'
import { calculateFgtsMonthly } from './fgts-calculator'
import { defaultIndexTable } from './index-table'

describe('fgts-calculator', () => {
  it('calculates FGTS for a single month', () => {
    const salaryHistory = [
      { month: '2025-01', baseSalary: 2881.72, lastSalary: 2881.72 },
    ]
    const result = calculateFgtsMonthly(
      salaryHistory,
      0.08,
      defaultIndexTable,
      { year: 2025, month: 3 },
      0,
      0,
    )
    expect(result.monthlyEntries).toHaveLength(1)
    expect(result.monthlyEntries[0].deposit).toBe(
      Math.round(2881.72 * 0.08 * 100) / 100,
    )
    expect(result.totalDeposit).toBeGreaterThan(0)
  })

  it('calculates FGTS for multiple months', () => {
    const salaryHistory = [
      { month: '2025-01', baseSalary: 2474.51, lastSalary: 2881.72 },
      { month: '2025-02', baseSalary: 2474.51, lastSalary: 2881.72 },
      { month: '2025-03', baseSalary: 2474.51, lastSalary: 2881.72 },
    ]
    const result = calculateFgtsMonthly(
      salaryHistory,
      0.08,
      defaultIndexTable,
      { year: 2025, month: 6 },
      0,
      0,
    )
    expect(result.monthlyEntries).toHaveLength(3)
    const expectedDeposit = Math.round(3 * 2881.72 * 0.08 * 100) / 100
    expect(result.totalDeposit).toBeCloseTo(expectedDeposit, 1)
  })

  it('adds extra entries for 13th and aviso prévio', () => {
    const salaryHistory = [
      { month: '2025-01', baseSalary: 2474.51, lastSalary: 2881.72 },
    ]
    const result = calculateFgtsMonthly(
      salaryHistory,
      0.08,
      defaultIndexTable,
      { year: 2025, month: 6 },
      500,
      1000,
    )
    // 13th and aviso prévio contribute to totals only — not stored as month entries.
    expect(result.monthlyEntries.length).toBe(1)
  })

  it('calculates 40% fine on totalFgts (corrected + interest)', () => {
    const salaryHistory = [
      { month: '2025-01', baseSalary: 2474.51, lastSalary: 2881.72 },
    ]
    const result = calculateFgtsMonthly(
      salaryHistory,
      0.08,
      defaultIndexTable,
      { year: 2025, month: 6 },
      0,
      0,
    )
    expect(result.fineValue).toBeCloseTo(
      Math.round(result.fineBase * 0.4 * 100) / 100,
      1,
    )
  })

  it('applies correction and interest per month', () => {
    const salaryHistory = [
      { month: '2025-01', baseSalary: 2474.51, lastSalary: 2881.72 },
    ]
    const result = calculateFgtsMonthly(
      salaryHistory,
      0.08,
      defaultIndexTable,
      { year: 2025, month: 6 },
      0,
      0,
    )
    const entry = result.monthlyEntries[0]
    expect(entry.corrected).toBeGreaterThanOrEqual(entry.deposit)
    expect(entry.total).toBeGreaterThanOrEqual(entry.deposit)
  })
})
