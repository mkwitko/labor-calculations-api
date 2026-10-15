import { systemPrisma as prisma } from 'prisma/prisma'
import { stripe } from '@/lib/stripe'
import { syncSubscriptionFromStripe } from '@/services/billing/sync-subscription'
import { findOwnedOrganization } from '@/services/tenant/owned-organization'
import { loseReferralForReferee, qualifyReferralForReferee } from './qualify'

export type ReconcileResult = {
  checked: number
  qualified: number
  lost: number
  failed: number
}

/**
 * Safety net for webhook events that never arrived.
 *
 * Stripe retries a failed delivery for three days, so this only has to cover
 * the rare case where an event is lost for good. It walks the referrals whose
 * state depends on billing — `signed_up` (waiting to qualify) and `qualified`
 * (which can fall to `lost`) — and asks Stripe what is actually true. The set
 * is small, so the API cost stays bounded.
 */
export async function reconcileReferrals(): Promise<ReconcileResult> {
  const referrals = await prisma.referral.findMany({
    where: {
      status: { in: ['signed_up', 'qualified'] },
    },
    select: {
      id: true,
      status: true,
      referee: { select: { id: true } },
    },
  })

  const result: ReconcileResult = {
    checked: referrals.length,
    qualified: 0,
    lost: 0,
    failed: 0,
  }

  for (const referral of referrals) {
    const referee = referral.referee

    if (!referee) continue

    const organization = await findOwnedOrganization(referee.id)
    const customerId = organization?.stripeCustomerId

    if (!customerId) continue

    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 1,
        expand: ['data.items'],
      })

      const subscription = subscriptions.data[0]

      if (subscription) {
        await syncSubscriptionFromStripe(subscription)
      }

      const isActive = subscription?.status === 'active'

      if (!isActive) {
        const { lost } = await loseReferralForReferee(referee.id, new Date())
        if (lost) result.lost++
        continue
      }

      if (referral.status === 'qualified') continue

      const invoices = await stripe.invoices.list({
        customer: customerId,
        status: 'paid',
        limit: 100,
      })

      const firstPaid = invoices.data
        .filter((invoice) => invoice.amount_paid > 0)
        .sort((a, b) => a.created - b.created)[0]

      if (!firstPaid) continue

      const { qualified } = await qualifyReferralForReferee(
        referee.id,
        firstPaid.amount_paid,
        new Date(firstPaid.created * 1000),
      )

      if (qualified) result.qualified++
    } catch (err) {
      result.failed++
      console.error('Referral reconcile failed', {
        referralId: referral.id,
        error: err,
      })
    }
  }

  return result
}
