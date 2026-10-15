import { describe, expect, it } from 'vitest'
import { nextTier, resolveTier, tierByName } from './tiers'

describe('resolveTier', () => {
  it('gives no discount before the first qualified referral', () => {
    const tier = resolveTier(0)

    expect(tier.tier).toBe('none')
    expect(tier.percentOff).toBe(0)
    expect(tier.couponId).toBeNull()
  })

  it.each([
    [1, 'bronze', 10],
    [2, 'bronze', 10],
    [3, 'prata', 25],
    [4, 'prata', 25],
    [5, 'ouro', 40],
    [7, 'ouro', 40],
    [8, 'diamante', 60],
    [20, 'diamante', 60],
  ])('maps %i qualified referrals to %s', (count, expected, percentOff) => {
    const tier = resolveTier(count)

    expect(tier.tier).toBe(expected)
    expect(tier.percentOff).toBe(percentOff)
  })

  it('caps the discount at the top tier', () => {
    expect(resolveTier(1000).percentOff).toBe(60)
  })

  it('names a coupon for every paying tier', () => {
    for (const count of [1, 3, 5, 8]) {
      expect(resolveTier(count).couponId).toMatch(/^referral_/)
    }
  })
})

describe('nextTier', () => {
  it('points at bronze from zero', () => {
    const next = nextTier(0)

    expect(next?.tier.tier).toBe('bronze')
    expect(next?.missing).toBe(1)
  })

  it('counts how many referrals are still missing', () => {
    expect(nextTier(2)?.tier.tier).toBe('prata')
    expect(nextTier(2)?.missing).toBe(1)
    expect(nextTier(4)?.tier.tier).toBe('ouro')
    expect(nextTier(4)?.missing).toBe(1)
    expect(nextTier(5)?.tier.tier).toBe('diamante')
    expect(nextTier(5)?.missing).toBe(3)
  })

  it('returns null once the top tier is reached', () => {
    expect(nextTier(8)).toBeNull()
    expect(nextTier(50)).toBeNull()
  })
})

describe('tierByName', () => {
  it('round-trips every tier resolved by count', () => {
    for (const count of [0, 1, 3, 5, 8]) {
      const tier = resolveTier(count)

      expect(tierByName(tier.tier)).toEqual(tier)
    }
  })
})
