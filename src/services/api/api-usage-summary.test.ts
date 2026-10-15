import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { issueApiKey } from './api-key-service'
import { summarizeApiUsage, type UsagePricePort } from './api-usage-summary'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

const NOW = new Date('2026-08-12T12:00:00.000Z')

/** Duas faixas: as 100 primeiras a R$ 2,00, o excedente a R$ 1,50. */
const price: UsagePricePort = {
  async readTiers() {
    return {
      currency: 'brl',
      tiers: [
        { upTo: 100, unitAmountCents: 200, flatAmountCents: 0 },
        { upTo: null, unitAmountCents: 150, flatAmountCents: 0 },
      ],
    }
  },
}

const mudo: UsagePricePort = {
  async readTiers() {
    return null
  },
}

async function scenario() {
  const { user, organization } = await createTestUser()

  const live = await issueApiKey({
    organizationId: organization.id,
    createdById: user.id,
    name: 'ERP',
  })

  const test = await issueApiKey({
    organizationId: organization.id,
    createdById: user.id,
    name: 'Sandbox',
    mode: 'test',
  })

  return { organizationId: organization.id, live, test }
}

async function usage(
  organizationId: string,
  apiKeyId: string,
  createdAt: Date,
  reported = false,
) {
  await systemPrisma.apiUsage.create({
    data: {
      organizationId,
      apiKeyId,
      endpoint: 'POST /v1/calculations/liquidacao',
      createdAt,
      reportedAt: reported ? createdAt : null,
    },
  })
}

describe('summarizeApiUsage', () => {
  it('sem assinatura, o ciclo é o mês corrente', async () => {
    const { organizationId, live } = await scenario()

    await usage(organizationId, live.id, new Date('2026-08-03T10:00:00.000Z'))
    // Mês anterior: fora do ciclo.
    await usage(organizationId, live.id, new Date('2026-07-30T10:00:00.000Z'))

    const summary = await summarizeApiUsage(organizationId, price, NOW)

    expect(summary.periodStart.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(summary.total).toBe(1)
  })

  it('conta a chamada de teste separada e fora do cobrável', async () => {
    const { organizationId, live, test } = await scenario()

    await usage(organizationId, live.id, NOW)
    await usage(organizationId, test.id, NOW)

    const summary = await summarizeApiUsage(organizationId, price, NOW)

    expect(summary.total).toBe(1)
    expect(summary.testTotal).toBe(1)
  })

  it('quebra o consumo por chave', async () => {
    const { organizationId, live, test } = await scenario()

    await usage(organizationId, live.id, NOW)
    await usage(organizationId, live.id, NOW)
    await usage(organizationId, test.id, NOW)

    const summary = await summarizeApiUsage(organizationId, price, NOW)
    const byName = Object.fromEntries(
      summary.byKey.map((key) => [key.name, key.calls]),
    )

    expect(byName).toEqual({ ERP: 2, Sandbox: 1 })
  })

  it('conta o que ainda não foi reportado ao medidor', async () => {
    const { organizationId, live } = await scenario()

    await usage(organizationId, live.id, NOW)
    await usage(organizationId, live.id, NOW, true)

    const summary = await summarizeApiUsage(organizationId, price, NOW)

    expect(summary.pending).toBe(1)
  })

  it('estima o valor pela faixa do preço', async () => {
    const { organizationId, live } = await scenario()

    for (let index = 0; index < 3; index += 1) {
      await usage(organizationId, live.id, NOW)
    }

    const summary = await summarizeApiUsage(organizationId, price, NOW)

    expect(summary.estimatedCents).toBe(600)
    expect(summary.currency).toBe('brl')
  })

  it('preço ilegível devolve contagem sem valor, e não quebra', async () => {
    const { organizationId, live } = await scenario()

    await usage(organizationId, live.id, NOW)

    const summary = await summarizeApiUsage(organizationId, mudo, NOW)

    // Valor chutado em tela de cobrança é o que este repo já proíbe.
    expect(summary.total).toBe(1)
    expect(summary.estimatedCents).toBeNull()
    expect(summary.currency).toBeNull()
  })
})
