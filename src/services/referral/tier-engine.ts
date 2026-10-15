import type { ReferralTier } from '@prisma/client'
import { prisma } from 'prisma/prisma'
import { stripe } from '@/lib/stripe'
import { sendEmail } from '@/services/email'
import { emailTemplates } from '@/services/email/templates'
import { findOwnedOrganization } from '@/services/tenant/owned-organization'
import { resolveTier, type TierDefinition } from './tiers'

export async function countQualifiedReferrals(
  referrerId: string,
): Promise<number> {
  return prisma.referral.count({
    where: { referrerId, status: 'qualified' },
  })
}

/**
 * Recomputes a referrer's tier from their qualified referrals and makes Stripe
 * agree with it.
 *
 * Idempotent: `User.referralTier` records what is currently applied, so a run
 * that computes the same tier touches nothing. Stripe is called before the
 * database is updated — if the Stripe call fails the stored tier stays stale
 * and the next event retries, which is safer than recording a discount that
 * was never applied.
 *
 * A user without a subscription (still in trial) only gets the tier recorded;
 * the coupon is attached later, at checkout.
 */
export async function syncReferralTier(referrerId: string): Promise<{
  tier: TierDefinition
  qualifiedCount: number
  applied: boolean
}> {
  const qualifiedCount = await countQualifiedReferrals(referrerId)
  const tier = resolveTier(qualifiedCount)

  const user = await prisma.user.findUnique({
    where: { id: referrerId },
    select: {
      name: true,
      mail: true,
      referralTier: true,
    },
  })

  if (!user || user.referralTier === tier.tier) {
    return { tier, qualifiedCount, applied: false }
  }

  const organization = await findOwnedOrganization(referrerId)
  const subscriptionId = organization?.subscription?.stripeSubscriptionId
  const isLive =
    organization?.subscription?.status === 'active' ||
    organization?.subscription?.status === 'trialing' ||
    organization?.subscription?.status === 'past_due'

  if (subscriptionId && isLive) {
    await applyTierCoupon(subscriptionId, tier)
  }

  await prisma.user.update({
    where: { id: referrerId },
    data: { referralTier: tier.tier },
  })

  if (isTierUpgrade(user.referralTier, tier.tier)) {
    const template = emailTemplates.referralTierUp({
      referrerName: user.name,
      tierLabel: tier.label,
      percentOff: tier.percentOff,
      qualifiedCount,
    })

    // A failed notification must not roll back a discount that Stripe already
    // applied, so the send is best-effort.
    await sendEmail({ to: user.mail, ...template }).catch((err) => {
      console.error('Referral tier e-mail failed', { referrerId, error: err })
    })
  }

  return { tier, qualifiedCount, applied: Boolean(subscriptionId && isLive) }
}

async function applyTierCoupon(
  subscriptionId: string,
  tier: TierDefinition,
): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    // An empty list clears any referral discount — this is how a demotion to
    // `none` removes the coupon.
    discounts: tier.couponId ? [{ coupon: tier.couponId }] : [],
  })
}

/**
 * Coupon to attach to a brand new checkout session, so a user who earned a
 * tier while still in trial does not pay full price on their first invoice.
 */
export async function couponForCheckout(
  userId: string,
): Promise<string | null> {
  const qualifiedCount = await countQualifiedReferrals(userId)

  return resolveTier(qualifiedCount).couponId
}

export function isTierUpgrade(from: ReferralTier, to: ReferralTier): boolean {
  const order: ReferralTier[] = ['none', 'bronze', 'prata', 'ouro', 'diamante']

  return order.indexOf(to) > order.indexOf(from)
}
