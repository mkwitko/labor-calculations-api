import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { issueApiKey } from './api-key-service'
import type { UsageItemPort } from './ensure-usage-item'
import {
  reportPendingApiUsage,
  type UsageBillingPort,
} from './report-api-usage'

/**
 * Item medido já presente na assinatura: o `ensureApiUsageItem` de dentro do
 * reporte é uma leitura e nada mais. Sem injetar isto, o teste bateria no
 * Stripe de verdade — o `env` carrega o `.env` por baixo, então a chave existe
 * na suíte.
 */
const itemPresent: UsageItemPort = {
  async listItems() {
    return [{ id: 'si_api', priceId: process.env.STRIPE_PRICE_ID_API ?? '' }]
  },
  async attachItem() {},
}

const NOW = new Date('2026-08-12T03:00:00.000Z')

async function seedUsage(count: number) {
  const { user, organization } = await createTestUser()

  await systemPrisma.subscription.create({
    data: {
      organizationId: organization.id,
      stripeSubscriptionId: `sub_${organization.id}`,
      stripeCustomerId: `cus_${organization.id}`,
      status: 'active',
    },
  })

  const issued = await issueApiKey({
    organizationId: organization.id,
    createdById: user.id,
    name: 'ERP',
  })

  for (let i = 0; i < count; i++) {
    await systemPrisma.apiUsage.create({
      data: {
        organizationId: organization.id,
        apiKeyId: issued.id,
        endpoint: 'POST /v1/calculations/liquidacao',
      },
    })
  }

  return { organization }
}

function fakePort() {
  const calls: Array<{
    customerId: string
    quantity: number
    identifier: string
  }> = []
  const port: UsageBillingPort = {
    async reportUsage(input) {
      calls.push(input)
    },
  }
  return { port, calls }
}

beforeEach(async () => {
  await cleanDatabase()
})

afterAll(async () => {
  await systemPrisma.$disconnect()
})

describe('reportPendingApiUsage', () => {
  it('agrega o pendente por organização e marca como reportado', async () => {
    const { organization } = await seedUsage(3)
    const { port, calls } = fakePort()

    const result = await reportPendingApiUsage(NOW, port, itemPresent)

    expect(result).toMatchObject({ organizations: 1, reported: 3 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      customerId: `cus_${organization.id}`,
      quantity: 3,
    })

    const pending = await systemPrisma.apiUsage.count({
      where: { reportedAt: null },
    })
    expect(pending).toBe(0)
  })

  it('não reporta duas vezes o mesmo lote', async () => {
    await seedUsage(2)
    const { port, calls } = fakePort()

    await reportPendingApiUsage(NOW, port, itemPresent)
    const second = await reportPendingApiUsage(NOW, port, itemPresent)

    expect(second.reported).toBe(0)
    expect(calls).toHaveLength(1)
  })

  it('usa identificador estável por organização e dia', async () => {
    const { organization } = await seedUsage(1)
    const { port, calls } = fakePort()

    await reportPendingApiUsage(NOW, port, itemPresent)

    expect(calls[0].identifier).toBe(`apiusage_${organization.id}_20260812`)
  })

  it('porta falhando deixa o uso pendente', async () => {
    await seedUsage(2)
    const port: UsageBillingPort = {
      async reportUsage() {
        throw new Error('stripe fora do ar')
      },
    }

    const result = await reportPendingApiUsage(NOW, port, itemPresent)

    expect(result.skipped).toBe(1)
    expect(
      await systemPrisma.apiUsage.count({ where: { reportedAt: null } }),
    ).toBe(2)
  })

  it('organização sem assinatura fica pendente, não perde o uso', async () => {
    const { user, organization } = await createTestUser()
    const issued = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'ERP',
    })
    await systemPrisma.apiUsage.create({
      data: {
        organizationId: organization.id,
        apiKeyId: issued.id,
        endpoint: 'POST /v1/calculations/liquidacao',
      },
    })
    const { port, calls } = fakePort()

    const result = await reportPendingApiUsage(NOW, port, itemPresent)

    expect(calls).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(
      await systemPrisma.apiUsage.count({ where: { reportedAt: null } }),
    ).toBe(1)
  })
})
