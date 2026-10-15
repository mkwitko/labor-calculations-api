import { describe, expect, it } from 'vitest'
import type { SalaryEntry } from '@/@types/labor-calculation-v3'
import { toMonthRange } from './date-utils'
import { defaultIndexTable } from './index-table'
import { calculateSalaryDifference } from './salary-difference-calculator'

const liquidationMonth = toMonthRange(new Date('2026-03-31'))

const salaryHist: SalaryEntry[] = [
  { month: '2025-01', baseSalary: 2000, lastSalary: 2500 },
  { month: '2025-02', baseSalary: 2000, lastSalary: 2500 },
  { month: '2025-03', baseSalary: 2000, lastSalary: 2500 },
  { month: '2025-04', baseSalary: 2000, lastSalary: 2500 },
  { month: '2025-05', baseSalary: 2000, lastSalary: 2500 },
  { month: '2025-06', baseSalary: 2000, lastSalary: 2500 },
]

describe('salary-difference-calculator', () => {
  it('computes monthly differences against paradigm salary', () => {
    const result = calculateSalaryDifference(
      {
        type: 'equiparacao',
        paradigmName: 'Paradigma',
        applyReflexos: true,
        periods: [
          { startMonth: '2025-01', endMonth: '2025-06', dueSalary: 3000 },
        ],
      },
      salaryHist,
      2500,
      defaultIndexTable,
      liquidationMonth,
      '2025-01',
      '2025-06',
      undefined,
      6,
      6,
      30,
    )
    expect(result.detail.monthlyEntries).toHaveLength(6)
    // diff = 3000 - 2500 = 500 per month
    expect(result.detail.totalDiff).toBe(3000)
    expect(result.monthlyAverage).toBe(500)
    expect(result.diffByMonth['2025-03']).toBe(500)
    // corrected >= nominal (positive inflation in the default table)
    expect(result.detail.totalCorrected).toBeGreaterThanOrEqual(3000)
    expect(result.detail.totalInterest).toBeGreaterThan(0)
  })

  it('uses explicit receivedSalary when provided (direct-difference mode)', () => {
    const result = calculateSalaryDifference(
      {
        type: 'desvio_funcao',
        applyReflexos: false,
        periods: [
          {
            startMonth: '2025-01',
            endMonth: '2025-02',
            dueSalary: 800,
            receivedSalary: 0,
          },
        ],
      },
      salaryHist,
      2500,
      defaultIndexTable,
      liquidationMonth,
      '2025-01',
      '2025-06',
      undefined,
      6,
      6,
      30,
    )
    // received = 0 → diff = full dueSalary
    expect(result.detail.totalDiff).toBe(1600)
    expect(result.detail.monthlyEntries[0].diff).toBe(800)
  })

  it('falls back to fallbackSalary for months missing in history', () => {
    const result = calculateSalaryDifference(
      {
        type: 'equiparacao',
        applyReflexos: false,
        periods: [
          { startMonth: '2025-07', endMonth: '2025-08', dueSalary: 3200 },
        ],
      },
      salaryHist, // has no 2025-07/08 entries
      2500,
      defaultIndexTable,
      liquidationMonth,
      '2025-01',
      '2025-12',
      undefined,
      6,
      6,
      30,
    )
    expect(result.detail.monthlyEntries[0].received).toBe(2500)
    expect(result.detail.totalDiff).toBe(1400)
  })

  it('clamps periods to the contract span', () => {
    const result = calculateSalaryDifference(
      {
        type: 'equiparacao',
        applyReflexos: false,
        periods: [
          { startMonth: '2024-10', endMonth: '2025-02', dueSalary: 3000 },
        ],
      },
      salaryHist,
      2500,
      defaultIndexTable,
      liquidationMonth,
      '2025-01',
      '2025-06',
      undefined,
      6,
      6,
      30,
    )
    // 2024-10..12 fall outside the contract → only Jan and Feb count
    expect(result.detail.monthlyEntries.map((e) => e.month)).toEqual([
      '2025-01',
      '2025-02',
    ])
  })

  it('applies the prescription cutoff', () => {
    const result = calculateSalaryDifference(
      {
        type: 'equiparacao',
        applyReflexos: false,
        periods: [
          { startMonth: '2025-01', endMonth: '2025-06', dueSalary: 3000 },
        ],
      },
      salaryHist,
      2500,
      defaultIndexTable,
      liquidationMonth,
      '2025-01',
      '2025-06',
      '2025-04',
      6,
      6,
      30,
    )
    expect(result.detail.monthlyEntries.map((e) => e.month)).toEqual([
      '2025-04',
      '2025-05',
      '2025-06',
    ])
  })

  it('ignores months where received >= due', () => {
    const result = calculateSalaryDifference(
      {
        type: 'equiparacao',
        applyReflexos: false,
        periods: [
          { startMonth: '2025-01', endMonth: '2025-02', dueSalary: 2400 },
        ],
      },
      salaryHist,
      2500,
      defaultIndexTable,
      liquidationMonth,
      '2025-01',
      '2025-06',
      undefined,
      6,
      6,
      30,
    )
    expect(result.detail.monthlyEntries).toHaveLength(0)
    expect(result.detail.totalDiff).toBe(0)
  })

  it('computes reflexos by monthly average (Súmula 226 pattern)', () => {
    const result = calculateSalaryDifference(
      {
        type: 'equiparacao',
        applyReflexos: true,
        periods: [
          { startMonth: '2025-01', endMonth: '2025-06', dueSalary: 3000 },
        ],
      },
      salaryHist,
      2500,
      defaultIndexTable,
      liquidationMonth,
      '2025-01',
      '2025-06',
      undefined,
      11,
      12,
      33,
    )
    // avg diff = 500
    expect(result.detail.reflexo13).toBe(
      Math.round(500 * (11 / 12) * 100) / 100,
    )
    expect(result.detail.reflexoVacation).toBe(
      Math.round(500 * (12 / 12) * (4 / 3) * 100) / 100,
    )
    // aviso: last month diff / 30 × days
    expect(result.detail.reflexoAviso).toBe(
      Math.round((500 / 30) * 33 * 100) / 100,
    )
  })

  it('skips reflexos when applyReflexos is false', () => {
    const result = calculateSalaryDifference(
      {
        type: 'equiparacao',
        applyReflexos: false,
        periods: [
          { startMonth: '2025-01', endMonth: '2025-06', dueSalary: 3000 },
        ],
      },
      salaryHist,
      2500,
      defaultIndexTable,
      liquidationMonth,
      '2025-01',
      '2025-06',
      undefined,
      11,
      12,
      33,
    )
    expect(result.detail.reflexo13).toBe(0)
    expect(result.detail.reflexoVacation).toBe(0)
    expect(result.detail.reflexoAviso).toBe(0)
  })
})
