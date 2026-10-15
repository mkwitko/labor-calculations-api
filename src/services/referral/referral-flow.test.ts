import { prisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { MS_PER_DAY } from '@/utils/constants'
import { attachReferral, ensureReferralCode } from './attribution'
import { runReferralCashback } from './cashback'
import { loseReferralForReferee, qualifyReferralForReferee } from './qualify'
import { countQualifiedReferrals } from './tier-engine'

// The referrer never has a Subscription row in these tests, so the tier engine
// records the tier without calling Stripe. Coupon application is covered by the
// pure tier table tests plus manual verification against a Stripe test account.

async function makeReferralPair() {
  const { user: referrer } = await createTestUser({ name: 'Ana Referrer' })
  const { user: referee } = await createTestUser({ name: 'Bruno Referee' })
  const code = await ensureReferralCode(referrer.id)

  return { referrer, referee, code }
}

describe('referral attribution', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('issues a stable code derived from the name', async () => {
    const { user } = await createTestUser({ name: 'Mauricio Oliveira' })

    const first = await ensureReferralCode(user.id)
    const second = await ensureReferralCode(user.id)

    expect(first).toMatch(/^MAUR[2-9A-Z]{4}$/)
    expect(second).toBe(first)
  })

  it('links a new user to the referrer', async () => {
    const { referrer, referee, code } = await makeReferralPair()

    const result = await attachReferral(referee.id, code)

    expect(result).toEqual({ linked: true, referrerId: referrer.id })

    const referral = await prisma.referral.findUnique({
      where: { refereeId: referee.id },
    })

    expect(referral?.status).toBe('signed_up')
    expect(referral?.referrerId).toBe(referrer.id)
  })

  it('accepts a lowercase code with surrounding spaces', async () => {
    const { referee, code } = await makeReferralPair()

    const result = await attachReferral(referee.id, `  ${code.toLowerCase()} `)

    expect(result.linked).toBe(true)
  })

  it('rejects an unknown code without throwing', async () => {
    const { user } = await createTestUser()

    await expect(attachReferral(user.id, 'NOPE1234')).resolves.toEqual({
      linked: false,
      reason: 'unknown_code',
    })
  })

  it('rejects self-referral', async () => {
    const { user } = await createTestUser()
    const code = await ensureReferralCode(user.id)

    await expect(attachReferral(user.id, code)).resolves.toEqual({
      linked: false,
      reason: 'self_referral',
    })
  })

  it('keeps the first referrer when a second link is used', async () => {
    const { referrer, referee, code } = await makeReferralPair()
    const { user: other } = await createTestUser({ name: 'Carla Other' })
    const otherCode = await ensureReferralCode(other.id)

    await attachReferral(referee.id, code)
    const second = await attachReferral(referee.id, otherCode)

    expect(second).toEqual({ linked: false, reason: 'already_referred' })

    const referral = await prisma.referral.findUnique({
      where: { refereeId: referee.id },
    })

    expect(referral?.referrerId).toBe(referrer.id)
  })

  it('reuses a pending e-mail invitation instead of duplicating it', async () => {
    const { referrer, referee, code } = await makeReferralPair()

    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        inviteEmail: referee.mail.toLowerCase(),
        status: 'pending',
      },
    })

    await attachReferral(referee.id, code, referee.mail)

    const referrals = await prisma.referral.findMany({
      where: { referrerId: referrer.id },
    })

    expect(referrals).toHaveLength(1)
    expect(referrals[0].status).toBe('signed_up')
    expect(referrals[0].refereeId).toBe(referee.id)
  })
})

describe('referral qualification', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('qualifies the referral when the referee pays', async () => {
    const { referrer, referee, code } = await makeReferralPair()
    await attachReferral(referee.id, code)

    const paidAt = new Date()
    const result = await qualifyReferralForReferee(referee.id, 9900, paidAt)

    expect(result).toEqual({ qualified: true, referrerId: referrer.id })

    const referral = await prisma.referral.findUnique({
      where: { refereeId: referee.id },
    })

    expect(referral?.status).toBe('qualified')
    expect(referral?.firstPaidAmountCents).toBe(9900)
    expect(await countQualifiedReferrals(referrer.id)).toBe(1)
  })

  it('promotes the referrer to the matching tier', async () => {
    const { user: referrer } = await createTestUser({ name: 'Ana Referrer' })
    const code = await ensureReferralCode(referrer.id)

    for (let i = 0; i < 3; i++) {
      const { user: referee } = await createTestUser({ name: `Referee ${i}` })
      await attachReferral(referee.id, code)
      await qualifyReferralForReferee(referee.id, 9900, new Date())
    }

    const updated = await prisma.user.findUnique({ where: { id: referrer.id } })

    expect(updated?.referralTier).toBe('prata')
  })

  it('ignores a zero-amount invoice', async () => {
    const { referee, code } = await makeReferralPair()
    await attachReferral(referee.id, code)

    const result = await qualifyReferralForReferee(referee.id, 0, new Date())

    expect(result.qualified).toBe(false)

    const referral = await prisma.referral.findUnique({
      where: { refereeId: referee.id },
    })

    expect(referral?.status).toBe('signed_up')
  })

  it('is idempotent across redelivered events', async () => {
    const { referrer, referee, code } = await makeReferralPair()
    await attachReferral(referee.id, code)

    await qualifyReferralForReferee(referee.id, 9900, new Date())
    const replay = await qualifyReferralForReferee(
      referee.id,
      12900,
      new Date(),
    )

    expect(replay.qualified).toBe(false)

    const referral = await prisma.referral.findUnique({
      where: { refereeId: referee.id },
    })

    // The cashback base must not move when the same event arrives twice.
    expect(referral?.firstPaidAmountCents).toBe(9900)
    expect(await countQualifiedReferrals(referrer.id)).toBe(1)
  })

  it('demotes the referrer when the referee cancels', async () => {
    const { referrer, referee, code } = await makeReferralPair()
    await attachReferral(referee.id, code)
    await qualifyReferralForReferee(referee.id, 9900, new Date())

    const result = await loseReferralForReferee(referee.id, new Date())

    expect(result.lost).toBe(true)
    expect(await countQualifiedReferrals(referrer.id)).toBe(0)

    const updated = await prisma.user.findUnique({ where: { id: referrer.id } })

    expect(updated?.referralTier).toBe('none')
  })

  it('keeps the original cashback base when a lost referee comes back', async () => {
    const { referee, code } = await makeReferralPair()
    await attachReferral(referee.id, code)
    await qualifyReferralForReferee(referee.id, 9900, new Date())
    await loseReferralForReferee(referee.id, new Date())

    await qualifyReferralForReferee(referee.id, 12900, new Date())

    const referral = await prisma.referral.findUnique({
      where: { refereeId: referee.id },
    })

    expect(referral?.status).toBe('qualified')
    expect(referral?.firstPaidAmountCents).toBe(9900)
    expect(referral?.lostAt).toBeNull()
  })
})

describe('referral cashback', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  async function qualifiedRefereeWithSubscription(qualifiedDaysAgo: number) {
    const { user: referrer } = await createTestUser({ name: 'Ana Referrer' })
    const { user: referee, organization: refereeOrganization } =
      await createTestUser({ name: 'Bruno Referee' })
    const code = await ensureReferralCode(referrer.id)

    await attachReferral(referee.id, code)

    const qualifiedAt = new Date(Date.now() - qualifiedDaysAgo * MS_PER_DAY)
    await qualifyReferralForReferee(referee.id, 9900, qualifiedAt)

    await prisma.organization.update({
      where: { id: refereeOrganization.id },
      data: { stripeCustomerId: `cus_test_${referee.id}` },
    })

    await prisma.subscription.create({
      data: {
        organizationId: refereeOrganization.id,
        stripeSubscriptionId: `sub_test_${referee.id}`,
        stripeCustomerId: `cus_test_${referee.id}`,
        status: 'active',
      },
    })

    return { referrer, referee, refereeOrganization }
  }

  it('does not pay before the 30-day hold', async () => {
    await qualifiedRefereeWithSubscription(10)

    const result = await runReferralCashback()

    expect(result.eligible).toBe(0)
    expect(result.paid).toBe(0)
  })

  it('skips a referee whose subscription is no longer active', async () => {
    const { refereeOrganization } = await qualifiedRefereeWithSubscription(40)

    await prisma.subscription.update({
      where: { organizationId: refereeOrganization.id },
      data: { status: 'canceled' },
    })

    const result = await runReferralCashback()

    // Eligible by date, but skipped before any Stripe call is attempted.
    expect(result.eligible).toBe(1)
    expect(result.paid).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('skips a referee without a Stripe customer', async () => {
    const { refereeOrganization } = await qualifiedRefereeWithSubscription(40)

    await prisma.organization.update({
      where: { id: refereeOrganization.id },
      data: { stripeCustomerId: null },
    })

    const result = await runReferralCashback()

    expect(result.skipped).toBe(1)
    expect(result.paid).toBe(0)
  })

  it('never re-pays a referral that already received the credit', async () => {
    const { referee } = await qualifiedRefereeWithSubscription(40)

    await prisma.referral.update({
      where: { refereeId: referee.id },
      data: { cashbackPaidAt: new Date() },
    })

    const result = await runReferralCashback()

    expect(result.eligible).toBe(0)
  })
})
