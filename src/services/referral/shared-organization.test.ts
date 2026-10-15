import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createMember, createTestUser } from '@/tests/helpers/db'
import { qualifyReferralForReferee } from './qualify'
import {
  demoteReferralIfSharedOrganization,
  sharesOrganization,
} from './shared-organization'

async function qualifiedReferral(referrerId: string, refereeId: string) {
  return systemPrisma.referral.create({
    data: {
      referrerId,
      refereeId,
      status: 'qualified',
      qualifiedAt: new Date('2026-07-01'),
      firstPaidAmountCents: 9700,
    },
    select: { id: true },
  })
}

describe('sharesOrganization', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('é verdadeiro para duas pessoas na mesma organização', async () => {
    const { user: owner, organization } = await createTestUser()
    const member = await createMember(organization.id, 'lawyer')

    expect(await sharesOrganization(owner.id, member.user.id)).toBe(true)
    expect(await sharesOrganization(member.user.id, owner.id)).toBe(true)
  })

  it('é falso quando a membership foi removida', async () => {
    const { user: owner, organization } = await createTestUser()
    const member = await createMember(organization.id, 'lawyer')

    await systemPrisma.membership.update({
      where: { id: member.membership.id },
      data: { deletedAt: new Date() },
    })

    expect(await sharesOrganization(owner.id, member.user.id)).toBe(false)
  })

  it('é falso para organizações distintas', async () => {
    const a = await createTestUser()
    const b = await createTestUser()

    expect(await sharesOrganization(a.user.id, b.user.id)).toBe(false)
  })
})

describe('qualifyReferralForReferee com organização compartilhada', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('não qualifica e marca como perdida quando dividem escritório', async () => {
    const { user: owner, organization } = await createTestUser()
    const member = await createMember(organization.id, 'lawyer')

    const referral = await systemPrisma.referral.create({
      data: { referrerId: owner.id, refereeId: member.user.id },
      select: { id: true },
    })

    const result = await qualifyReferralForReferee(
      member.user.id,
      9700,
      new Date('2026-08-01'),
    )

    expect(result).toEqual({ qualified: false })

    const stored = await systemPrisma.referral.findUniqueOrThrow({
      where: { id: referral.id },
      select: { status: true, lostAt: true },
    })

    expect(stored.status).toBe('lost')
    expect(stored.lostAt).not.toBeNull()
  })

  it('continua qualificando entre organizações distintas', async () => {
    const referrer = await createTestUser()
    const referee = await createTestUser()

    await systemPrisma.referral.create({
      data: { referrerId: referrer.user.id, refereeId: referee.user.id },
    })

    const result = await qualifyReferralForReferee(
      referee.user.id,
      9700,
      new Date('2026-08-01'),
    )

    expect(result).toMatchObject({
      qualified: true,
      referrerId: referrer.user.id,
    })
  })
})

describe('demoteReferralIfSharedOrganization', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('rebaixa indicação já qualificada quando passam a dividir organização', async () => {
    const { user: owner, organization } = await createTestUser()
    const member = await createMember(organization.id, 'lawyer')
    const referral = await qualifiedReferral(owner.id, member.user.id)

    expect(
      await demoteReferralIfSharedOrganization(member.user.id, new Date()),
    ).toBe(true)

    const stored = await systemPrisma.referral.findUniqueOrThrow({
      where: { id: referral.id },
      select: { status: true },
    })

    expect(stored.status).toBe('lost')
  })

  it('não mexe em indicação de quem não divide organização', async () => {
    const referrer = await createTestUser()
    const referee = await createTestUser()
    const referral = await qualifiedReferral(referrer.user.id, referee.user.id)

    expect(
      await demoteReferralIfSharedOrganization(referee.user.id, new Date()),
    ).toBe(false)

    const stored = await systemPrisma.referral.findUniqueOrThrow({
      where: { id: referral.id },
      select: { status: true },
    })

    expect(stored.status).toBe('qualified')
  })

  it('não mexe em indicação que ainda não qualificou', async () => {
    const { user: owner, organization } = await createTestUser()
    const member = await createMember(organization.id, 'lawyer')

    await systemPrisma.referral.create({
      data: { referrerId: owner.id, refereeId: member.user.id },
    })

    expect(
      await demoteReferralIfSharedOrganization(member.user.id, new Date()),
    ).toBe(false)
  })

  it('ignora quem não tem indicação nenhuma', async () => {
    const { user } = await createTestUser()

    expect(await demoteReferralIfSharedOrganization(user.id, new Date())).toBe(
      false,
    )
  })
})
