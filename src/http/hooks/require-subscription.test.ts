import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

const MS_PER_DAY = 24 * 60 * 60 * 1000

function authToken(userId: string): string {
  return app.jwt.sign({ sub: userId })
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * MS_PER_DAY)
}

async function expireTrial(organizationId: string) {
  await systemPrisma.organization.update({
    where: { id: organizationId },
    data: { trialEndsAt: daysFromNow(-1) },
  })
}

async function giveSubscription(
  organizationId: string,
  status: string,
  currentPeriodEnd: Date | null,
) {
  await systemPrisma.subscription.create({
    data: {
      organizationId,
      stripeSubscriptionId: `sub_${organizationId}`,
      stripeCustomerId: `cus_${organizationId}`,
      status,
      currentPeriodEnd,
    },
  })
}

function createCase(userId: string) {
  return app.inject({
    method: 'POST',
    url: '/cases',
    headers: { authorization: `Bearer ${authToken(userId)}` },
    payload: { title: 'Reclamação trabalhista', phase: 'distribuido' },
  })
}

describe('requireSubscription', () => {
  it('allows a write while the organization trial is running', async () => {
    const { user } = await createTestUser()

    expect((await createCase(user.id)).statusCode).toBe(201)
  })

  it('blocks a write with 402 once the trial expired and no subscription exists', async () => {
    const { user, organization } = await createTestUser()
    await expireTrial(organization.id)

    const res = await createCase(user.id)

    expect(res.statusCode).toBe(402)
    expect(res.json().message).toContain('teste')
  })

  it('keeps reads open after the trial expired', async () => {
    const { user, organization } = await createTestUser()
    await expireTrial(organization.id)

    const res = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(200)
  })

  it.each([
    'active',
    'trialing',
  ])('allows a write when the subscription is %s', async (status) => {
    const { user, organization } = await createTestUser()
    await expireTrial(organization.id)
    await giveSubscription(organization.id, status, daysFromNow(20))

    expect((await createCase(user.id)).statusCode).toBe(201)
  })

  it('blocks a write when the subscription is canceled', async () => {
    const { user, organization } = await createTestUser()
    await giveSubscription(organization.id, 'canceled', daysFromNow(-40))

    expect((await createCase(user.id)).statusCode).toBe(402)
  })

  // A linha de assinatura vence `trialEndsAt`: quem cancelou dentro do período
  // de teste não volta a escrever só porque a data do teste ainda não passou.
  it('ignores a running trial when a dead subscription row exists', async () => {
    const { user, organization } = await createTestUser()
    await giveSubscription(organization.id, 'canceled', daysFromNow(-1))

    expect((await createCase(user.id)).statusCode).toBe(402)
  })

  it('allows a write while past_due is inside the grace window', async () => {
    const { user, organization } = await createTestUser()
    await expireTrial(organization.id)
    await giveSubscription(organization.id, 'past_due', daysFromNow(-2))

    expect((await createCase(user.id)).statusCode).toBe(201)
  })

  it('blocks a write once past_due passed the grace window', async () => {
    const { user, organization } = await createTestUser()
    await expireTrial(organization.id)
    await giveSubscription(organization.id, 'past_due', daysFromNow(-10))

    const res = await createCase(user.id)

    expect(res.statusCode).toBe(402)
    expect(res.json().message).toContain('pagamento')
  })
})
