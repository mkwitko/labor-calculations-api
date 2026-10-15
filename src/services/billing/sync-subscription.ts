import { systemPrisma as prisma } from 'prisma/prisma'
import type { StripeCustomerRef, StripeSubscription } from '@/@types/stripe'

// Stripe statuses in which a subscription no longer represents a live
// relationship. An event carrying one of these must never overwrite a row that
// already points at a different, still-live subscription.
const TERMINAL_STATUSES = new Set(['canceled', 'incomplete_expired'])

function toDate(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null
}

export function extractCustomerId(customer: StripeCustomerRef): string | null {
  if (!customer) return null

  return typeof customer === 'string' ? customer : customer.id
}

export async function findOrganizationByStripeCustomerId(
  customerId: string | null,
): Promise<{ id: string } | null> {
  if (!customerId) return null

  return prisma.organization.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  })
}

/**
 * Mirrors a Stripe subscription into the local `Subscription` row.
 *
 * Keyed by organization rather than by Stripe id: the product sells one
 * subscription per organization, and keying by organization is what makes the
 * row cheap to read on every route guard. A customer can still accumulate
 * several Stripe subscription objects over time (cancel, resubscribe), so an
 * event from an old, dead subscription is ignored when a different one is
 * already stored.
 */
export async function syncSubscriptionFromStripe(
  subscription: StripeSubscription,
): Promise<void> {
  const customerId = extractCustomerId(subscription.customer)
  const organization = await findOrganizationByStripeCustomerId(customerId)

  if (!organization || !customerId) return

  const existing = await prisma.subscription.findUnique({
    where: { organizationId: organization.id },
    select: { stripeSubscriptionId: true },
  })

  const isStale =
    existing != null &&
    existing.stripeSubscriptionId !== subscription.id &&
    TERMINAL_STATUSES.has(subscription.status)

  if (isStale) return

  const item = subscription.items.data[0]

  const data = {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    status: subscription.status,
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEnd: toDate(subscription.trial_end),
  }

  await prisma.subscription.upsert({
    where: { organizationId: organization.id },
    create: { organizationId: organization.id, ...data },
    update: data,
  })
}

/**
 * Records when an organization's subscription first collected real money.
 * Written once and never overwritten — later invoices must not move the date.
 */
export async function markSubscriptionFirstPaid(
  organizationId: string,
  paidAt: Date,
): Promise<void> {
  await prisma.subscription.updateMany({
    where: { organizationId, firstPaidAt: null },
    data: { firstPaidAt: paidAt },
  })
}
