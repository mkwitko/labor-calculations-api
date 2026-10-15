import type { ReferralTier } from '@prisma/client'

export type TierDefinition = {
  tier: ReferralTier
  label: string
  minQualified: number
  percentOff: number
  // Coupon ids are deterministic and created once per Stripe account
  // (`referral_bronze`, `referral_prata`, ...), so they live in code instead of
  // in the environment.
  couponId: string | null
}

// Ordered from the highest tier down — `resolveTier` returns the first match.
export const REFERRAL_TIERS: TierDefinition[] = [
  {
    tier: 'diamante',
    label: 'Diamante',
    minQualified: 8,
    percentOff: 60,
    couponId: 'referral_diamante',
  },
  {
    tier: 'ouro',
    label: 'Ouro',
    minQualified: 5,
    percentOff: 40,
    couponId: 'referral_ouro',
  },
  {
    tier: 'prata',
    label: 'Prata',
    minQualified: 3,
    percentOff: 25,
    couponId: 'referral_prata',
  },
  {
    tier: 'bronze',
    label: 'Bronze',
    minQualified: 1,
    percentOff: 10,
    couponId: 'referral_bronze',
  },
  {
    tier: 'none',
    label: 'Sem indicações',
    minQualified: 0,
    percentOff: 0,
    couponId: null,
  },
]

export function resolveTier(qualifiedCount: number): TierDefinition {
  const match = REFERRAL_TIERS.find((t) => qualifiedCount >= t.minQualified)

  // The last entry requires 0, so a match always exists; the fallback only
  // satisfies the type checker.
  return match ?? REFERRAL_TIERS[REFERRAL_TIERS.length - 1]
}

export function tierByName(tier: ReferralTier): TierDefinition {
  const match = REFERRAL_TIERS.find((t) => t.tier === tier)

  return match ?? REFERRAL_TIERS[REFERRAL_TIERS.length - 1]
}

/**
 * The tier immediately above the current count, plus how many more qualified
 * referrals it takes to get there. Returns null at the top tier.
 */
export function nextTier(
  qualifiedCount: number,
): { tier: TierDefinition; missing: number } | null {
  const above = REFERRAL_TIERS.filter(
    (t) => t.minQualified > qualifiedCount,
  ).sort((a, b) => a.minQualified - b.minQualified)

  const target = above[0]

  if (!target) return null

  return { tier: target, missing: target.minQualified - qualifiedCount }
}
