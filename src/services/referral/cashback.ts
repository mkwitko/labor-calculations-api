import { systemPrisma as prisma } from 'prisma/prisma'
import { stripe } from '@/lib/stripe'
import { sendEmail } from '@/services/email'
import { emailTemplates } from '@/services/email/templates'
import { findOwnedOrganization } from '@/services/tenant/owned-organization'
import { MS_PER_DAY } from '@/utils/constants'

// Days a referee must stay subscribed before the cashback is released. The
// waiting period is what stops "pay one month, cancel, collect" from working.
export const CASHBACK_HOLD_DAYS = 30

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export type CashbackRunResult = {
  eligible: number
  paid: number
  skipped: number
  failed: number
}

/**
 * Credits the first-month cashback to referees who have been paying for
 * {@link CASHBACK_HOLD_DAYS} days.
 *
 * The credit is a negative customer balance transaction, which Stripe applies
 * to the next invoice automatically. Each transaction carries an idempotency
 * key derived from the referral id, so a crash between the Stripe call and the
 * database write cannot credit the same person twice on the next run.
 */
export async function runReferralCashback(): Promise<CashbackRunResult> {
  const cutoff = new Date(Date.now() - CASHBACK_HOLD_DAYS * MS_PER_DAY)

  const due = await prisma.referral.findMany({
    where: {
      status: 'qualified',
      cashbackPaidAt: null,
      qualifiedAt: { lte: cutoff },
      firstPaidAmountCents: { gt: 0 },
    },
    select: {
      id: true,
      firstPaidAmountCents: true,
      referee: {
        select: {
          id: true,
          name: true,
          mail: true,
        },
      },
    },
  })

  const result: CashbackRunResult = {
    eligible: due.length,
    paid: 0,
    skipped: 0,
    failed: 0,
  }

  for (const referral of due) {
    const referee = referral.referee
    const amount = referral.firstPaidAmountCents ?? 0

    if (!referee) {
      result.skipped++
      continue
    }

    const organization = await findOwnedOrganization(referee.id)

    if (
      !organization?.stripeCustomerId ||
      organization.subscription?.status !== 'active'
    ) {
      result.skipped++
      continue
    }

    try {
      await stripe.customers.createBalanceTransaction(
        organization.stripeCustomerId,
        {
          amount: -amount,
          currency: 'brl',
          description: `Cashback de indicação (${referral.id})`,
        },
        { idempotencyKey: `referral-cashback-${referral.id}` },
      )

      await prisma.referral.update({
        where: { id: referral.id },
        data: { cashbackPaidAt: new Date() },
      })

      result.paid++

      const template = emailTemplates.referralCashbackPaid({
        refereeName: referee.name,
        amountLabel: formatBRL(amount),
      })

      await sendEmail({ to: referee.mail, ...template }).catch((err) => {
        console.error('Cashback e-mail failed', {
          referralId: referral.id,
          error: err,
        })
      })
    } catch (err) {
      result.failed++
      console.error('Cashback credit failed', {
        referralId: referral.id,
        error: err,
      })
    }
  }

  return result
}
