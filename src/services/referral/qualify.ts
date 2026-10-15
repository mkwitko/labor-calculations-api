import { prisma } from 'prisma/prisma'
import { sharesOrganization } from './shared-organization'
import { syncReferralTier } from './tier-engine'

/**
 * Promotes the referral of a user who just paid a real invoice.
 *
 * Called from the Stripe webhook only. Idempotent by design: a redelivered
 * event finds the referral already `qualified` and returns without touching
 * the frozen `firstPaidAmountCents`, which the cashback is based on.
 *
 * A referral in `lost` can come back — a referee who cancels and resubscribes
 * counts again, but keeps the original cashback base so the credit cannot be
 * claimed twice.
 */
export async function qualifyReferralForReferee(
  refereeId: string,
  amountPaidCents: number,
  paidAt: Date,
): Promise<{ qualified: boolean; referrerId?: string }> {
  if (amountPaidCents <= 0) return { qualified: false }

  const referral = await prisma.referral.findUnique({
    where: { refereeId },
    select: {
      id: true,
      referrerId: true,
      status: true,
      firstPaidAmountCents: true,
    },
  })

  if (!referral || referral.status === 'qualified') {
    return { qualified: false }
  }

  // Escritório que indica os próprios associados não sobe de nível: a segunda
  // assinatura sai do mesmo bolso. Marca como `lost` em vez de só não
  // qualificar, para que uma tentativa não fique pendente para sempre.
  if (await sharesOrganization(referral.referrerId, refereeId)) {
    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: 'lost', lostAt: paidAt },
    })

    await syncReferralTier(referral.referrerId)

    return { qualified: false }
  }

  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: 'qualified',
      qualifiedAt: paidAt,
      lostAt: null,
      firstPaidAmountCents: referral.firstPaidAmountCents ?? amountPaidCents,
    },
  })

  await syncReferralTier(referral.referrerId)

  return { qualified: true, referrerId: referral.referrerId }
}

/**
 * Demotes the referral of a user who cancelled or was refunded, which may drop
 * the referrer to a lower tier on their next billing cycle.
 */
export async function loseReferralForReferee(
  refereeId: string,
  lostAt: Date,
): Promise<{ lost: boolean; referrerId?: string }> {
  const referral = await prisma.referral.findUnique({
    where: { refereeId },
    select: { id: true, referrerId: true, status: true },
  })

  if (!referral || referral.status !== 'qualified') {
    return { lost: false }
  }

  await prisma.referral.update({
    where: { id: referral.id },
    data: { status: 'lost', lostAt },
  })

  await syncReferralTier(referral.referrerId)

  return { lost: true, referrerId: referral.referrerId }
}
