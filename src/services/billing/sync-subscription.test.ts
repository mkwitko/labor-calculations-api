import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import {
  findOrganizationByStripeCustomerId,
  markSubscriptionFirstPaid,
  syncSubscriptionFromStripe,
} from './sync-subscription'

function fakeSubscription(customerId: string, overrides = {}) {
  return {
    id: 'sub_123',
    customer: customerId,
    status: 'active',
    cancel_at_period_end: false,
    trial_end: null,
    items: {
      data: [
        {
          price: { id: 'price_abc' },
          current_period_end: 1800000000,
          quantity: 3,
        },
      ],
    },
    ...overrides,
  } as never
}

async function orgWithCustomer(customerId: string) {
  const { organization } = await createTestUser()

  return systemPrisma.organization.update({
    where: { id: organization.id },
    data: { stripeCustomerId: customerId },
  })
}

describe('sync-subscription por organização', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('acha a organização pelo customer do Stripe', async () => {
    const organization = await orgWithCustomer('cus_1')

    expect(await findOrganizationByStripeCustomerId('cus_1')).toEqual({
      id: organization.id,
    })
  })

  it('devolve null para customer desconhecido', async () => {
    expect(await findOrganizationByStripeCustomerId('cus_ninguem')).toBeNull()
  })

  it('espelha a assinatura na organização', async () => {
    const organization = await orgWithCustomer('cus_2')

    await syncSubscriptionFromStripe(fakeSubscription('cus_2'))

    const stored = await systemPrisma.subscription.findUnique({
      where: { organizationId: organization.id },
    })

    expect(stored?.stripeSubscriptionId).toBe('sub_123')
    expect(stored?.status).toBe('active')
  })

  it('ignora evento de assinatura morta quando outra já está gravada', async () => {
    const organization = await orgWithCustomer('cus_3')

    await syncSubscriptionFromStripe(fakeSubscription('cus_3'))
    await syncSubscriptionFromStripe(
      fakeSubscription('cus_3', { id: 'sub_antiga', status: 'canceled' }),
    )

    const stored = await systemPrisma.subscription.findUnique({
      where: { organizationId: organization.id },
    })

    expect(stored?.stripeSubscriptionId).toBe('sub_123')
  })

  it('grava firstPaidAt uma vez só', async () => {
    const organization = await orgWithCustomer('cus_4')
    await syncSubscriptionFromStripe(fakeSubscription('cus_4'))

    const primeiro = new Date('2026-01-01')
    const segundo = new Date('2026-02-01')
    await markSubscriptionFirstPaid(organization.id, primeiro)
    await markSubscriptionFirstPaid(organization.id, segundo)

    const stored = await systemPrisma.subscription.findUnique({
      where: { organizationId: organization.id },
    })

    expect(stored?.firstPaidAt).toEqual(primeiro)
  })
})
