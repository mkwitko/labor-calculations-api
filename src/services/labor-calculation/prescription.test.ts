import { describe, expect, it } from 'vitest'
import { filterMonthEntries, getPrescricaoCutoffKey } from './prescription'

describe('prescription', () => {
  it('computes cutoff key 5 years before the base date', () => {
    expect(getPrescricaoCutoffKey(new Date('2025-09-18'))).toBe('2020-09')
    expect(getPrescricaoCutoffKey(new Date('2026-01-01'))).toBe('2021-01')
    expect(getPrescricaoCutoffKey(new Date('2024-12-31'))).toBe('2019-12')
  })

  it('filters entries strictly before the cutoff month', () => {
    const entries = [
      { month: '2020-08', value: 1 },
      { month: '2020-09', value: 2 },
      { month: '2021-01', value: 3 },
    ]
    const filtered = filterMonthEntries(entries, '2020-09')
    expect(filtered.map((e) => e.month)).toEqual(['2020-09', '2021-01'])
  })

  it('returns entries unchanged when no cutoff is provided', () => {
    const entries = [{ month: '2018-01' }, { month: '2025-12' }]
    expect(filterMonthEntries(entries, undefined)).toEqual(entries)
  })

  it('returns empty array when all entries are prescribed', () => {
    const entries = [{ month: '2015-01' }, { month: '2016-06' }]
    expect(filterMonthEntries(entries, '2020-09')).toEqual([])
  })
})
