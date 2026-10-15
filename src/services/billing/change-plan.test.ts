import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  changePlan,
  type PlanBillingPort,
  pickPlanItem,
} from '@/services/billing/change-plan'
import { clearPlansCache, type PlansPort } from '@/services/billing/list-plans'
import { cleanDatabase, createMember, createTestUser } from '@/tests/helpers/db'
import { fakePlansPort, planPrices } from '@/tests/helpers/plans'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  clearPlansCache()
  await cleanDatabase()
})

const { port } = fakePlansPort([
  ...planPrices('solo', 1, 1),
  ...planPrices('banca', 5, 2),
])

function fakeBilling(
  currentPriceId = 'price_solo_monthly',
  remoteStatus = 'active',
) {
  const swaps: Array<{ priceId: string; prorationBehavior: string }> = []

  const billing: PlanBillingPort = {
    async readPlanItem() {
      return { itemId: 'si_1', priceId: currentPriceId, status: remoteStatus }
    },
    async swapPrice({ priceId, prorationBehavior }) {
      swaps.push({ priceId, prorationBehavior })
    },
  }

  return { billing, swaps }
}

async function organizationWithSubscription(status = 'active') {
  const { organization } = await createTestUser()

  await systemPrisma.subscription.create({
    data: {
      organizationId: organization.id,
      stripeSubscriptionId: `sub_${organization.id}`,
      stripeCustomerId: 'cus_x',
      status,
      priceId: 'price_solo_monthly',
    },
  })

  return organization
}

describe('changePlan', () => {
  it('grava a escolha mesmo sem assinatura, que é o caso do trial', async () => {
    const { organization } = await createTestUser()
    const { billing, swaps } = fakeBilling()

    const result = await changePlan(
      organization.id,
      'banca',
      'monthly',
      billing,
      port,
    )

    expect(result.subscriptionUpdated).toBe(false)
    expect(swaps).toHaveLength(0)

    const saved = await systemPrisma.organization.findUniqueOrThrow({
      where: { id: organization.id },
      select: { planCode: true },
    })

    expect(saved.planCode).toBe('banca')
  })

  it('cobra na hora na subida de plano', async () => {
    const organization = await organizationWithSubscription()
    const { billing, swaps } = fakeBilling()

    await changePlan(organization.id, 'banca', 'monthly', billing, port)

    expect(swaps).toEqual([
      { priceId: 'price_banca_monthly', prorationBehavior: 'always_invoice' },
    ])
  })

  it('na descida gera crédito, não cobrança', async () => {
    const organization = await organizationWithSubscription()

    await systemPrisma.subscription.updateMany({
      where: { organizationId: organization.id },
      data: { priceId: 'price_banca_monthly' },
    })

    const { billing, swaps } = fakeBilling('price_banca_monthly')

    await changePlan(organization.id, 'solo', 'monthly', billing, port)

    expect(swaps[0].prorationBehavior).toBe('create_prorations')
  })

  it('guarda o preço novo na assinatura local', async () => {
    const organization = await organizationWithSubscription()
    const { billing } = fakeBilling()

    await changePlan(organization.id, 'banca', 'yearly', billing, port)

    const subscription = await systemPrisma.subscription.findFirstOrThrow({
      where: { organizationId: organization.id },
      select: { priceId: true },
    })

    expect(subscription.priceId).toBe('price_banca_yearly')
  })

  it('não chama o Stripe quando o preço já é o de destino', async () => {
    const organization = await organizationWithSubscription()
    const { billing, swaps } = fakeBilling('price_solo_monthly')

    const result = await changePlan(
      organization.id,
      'solo',
      'monthly',
      billing,
      port,
    )

    expect(swaps).toHaveLength(0)
    expect(result.subscriptionUpdated).toBe(false)
  })

  it('recusa a descida que teria de expulsar gente', async () => {
    const organization = await organizationWithSubscription()
    await createMember(organization.id, 'lawyer')

    await systemPrisma.subscription.updateMany({
      where: { organizationId: organization.id },
      data: { priceId: 'price_banca_monthly' },
    })

    const { billing, swaps } = fakeBilling('price_banca_monthly')

    await expect(
      changePlan(organization.id, 'solo', 'monthly', billing, port),
    ).rejects.toMatchObject({ statusCode: 409 })

    expect(swaps).toHaveLength(0)
  })

  it('assinatura cancelada no Stripe guarda a escolha e acerta o status local', async () => {
    // Status local velho (webhook perdido) não pode virar 503 numa tela de
    // cobrança: o `planCode` fica gravado e vale quando a assinatura voltar.
    const organization = await organizationWithSubscription()
    const { billing, swaps } = fakeBilling('price_solo_monthly', 'canceled')

    const result = await changePlan(
      organization.id,
      'banca',
      'monthly',
      billing,
      port,
    )

    expect(result.subscriptionUpdated).toBe(false)
    expect(swaps).toHaveLength(0)

    const saved = await systemPrisma.subscription.findFirstOrThrow({
      where: { organizationId: organization.id },
      select: { status: true },
    })

    expect(saved.status).toBe('canceled')

    const savedOrganization = await systemPrisma.organization.findUniqueOrThrow(
      { where: { id: organization.id }, select: { planCode: true } },
    )

    expect(savedOrganization.planCode).toBe('banca')
  })

  it('recusa intervalo que o plano não publica', async () => {
    const { organization } = await createTestUser()
    const { billing } = fakeBilling()

    const soMensal: PlansPort = {
      async readPlanPrices() {
        return {
          plans: planPrices('banca', 5, 2).filter(
            (p) => p.interval === 'monthly',
          ),
          extras: [],
        }
      },
    }

    await expect(
      changePlan(organization.id, 'banca', 'yearly', billing, soMensal),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('propaga a falha do Stripe: trocar de plano é decisão, não contador', async () => {
    const organization = await organizationWithSubscription()

    const quebrado: PlanBillingPort = {
      async readPlanItem() {
        throw new Error('stripe fora')
      },
      async swapPrice() {},
    }

    await expect(
      changePlan(organization.id, 'banca', 'monthly', quebrado, port),
    ).rejects.toThrow()
  })
})

describe('pickPlanItem', () => {
  it('escolhe o item licenciado, não o medido', () => {
    const items = [
      { id: 'si_uso', price: { recurring: { usage_type: 'metered' } } },
      { id: 'si_plano', price: { recurring: { usage_type: 'licensed' } } },
    ]

    // Trocar o preço do índice 0 às cegas apagaria a cobrança de uso da API.
    expect(pickPlanItem(items)?.id).toBe('si_plano')
  })

  it('assinatura antiga, de item único, continua caindo no mesmo item', () => {
    const items = [{ id: 'si_1', price: { recurring: {} } }]

    expect(pickPlanItem(items)?.id).toBe('si_1')
  })
})
