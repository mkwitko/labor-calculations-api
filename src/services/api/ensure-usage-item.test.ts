import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { ensureApiUsageItem, type UsageItemPort } from './ensure-usage-item'

const PRICE_ID = 'price_api_test'

async function orgWithSubscription() {
  const { organization } = await createTestUser()

  await systemPrisma.subscription.create({
    data: {
      organizationId: organization.id,
      stripeSubscriptionId: `sub_${organization.id}`,
      stripeCustomerId: `cus_${organization.id}`,
      status: 'active',
    },
  })

  return organization
}

function fakePort(items: Array<{ id: string; priceId: string | null }> = []) {
  const attached: Array<{ subscriptionId: string; priceId: string }> = []
  const port: UsageItemPort = {
    async listItems() {
      return items
    },
    async attachItem(input) {
      attached.push(input)
    },
  }
  return { port, attached }
}

beforeEach(async () => {
  await cleanDatabase()
})

afterAll(async () => {
  await systemPrisma.$disconnect()
})

describe('ensureApiUsageItem', () => {
  it('anexa o item medido quando falta', async () => {
    const organization = await orgWithSubscription()
    const { port, attached } = fakePort([
      { id: 'si_seat', priceId: 'price_seat' },
    ])

    const result = await ensureApiUsageItem(organization.id, PRICE_ID, port)

    expect(result).toBe('created')
    expect(attached).toEqual([
      { subscriptionId: `sub_${organization.id}`, priceId: PRICE_ID },
    ])
  })

  it('não duplica quando o item já está lá', async () => {
    const organization = await orgWithSubscription()
    const { port, attached } = fakePort([
      { id: 'si_seat', priceId: 'price_seat' },
      { id: 'si_api', priceId: PRICE_ID },
    ])

    const result = await ensureApiUsageItem(organization.id, PRICE_ID, port)

    expect(result).toBe('present')
    expect(attached).toEqual([])
  })

  it('não faz nada sem o preço configurado', async () => {
    const organization = await orgWithSubscription()
    const { port, attached } = fakePort()

    const result = await ensureApiUsageItem(organization.id, undefined, port)

    expect(result).toBe('skipped')
    expect(attached).toEqual([])
  })

  it('não faz nada quando a organização ainda não tem assinatura', async () => {
    const { organization } = await createTestUser()
    const { port, attached } = fakePort()

    const result = await ensureApiUsageItem(organization.id, PRICE_ID, port)

    expect(result).toBe('skipped')
    expect(attached).toEqual([])
  })

  it('propaga falha da porta para quem chama decidir', async () => {
    const organization = await orgWithSubscription()
    const port: UsageItemPort = {
      async listItems() {
        throw new Error('stripe fora do ar')
      },
      async attachItem() {},
    }

    await expect(
      ensureApiUsageItem(organization.id, PRICE_ID, port),
    ).rejects.toThrow('stripe fora do ar')
  })
})
