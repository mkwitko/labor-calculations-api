import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { clearPlansCache, type PlansPort } from '@/services/billing/list-plans'
import {
  type PlanPreviewPort,
  previewPlanChange,
} from '@/services/billing/plan-preview'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { fakePlansPort, planPrices } from '@/tests/helpers/plans'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  clearPlansCache()
  await cleanDatabase()
})

const { port: plans } = fakePlansPort([
  ...planPrices('solo', 1, 1),
  ...planPrices('banca', 5, 2),
])

function fakePreview(amountDueCents = 12_345, remoteStatus = 'active') {
  const previews: Array<{ priceId: string; prorationBehavior: string }> = []

  const port: PlanPreviewPort = {
    async readPlanItem() {
      return { itemId: 'si_1', status: remoteStatus }
    },
    async previewInvoice({ priceId, prorationBehavior }) {
      previews.push({ priceId, prorationBehavior })

      return { amountDueCents, currency: 'brl' }
    },
  }

  return { port, previews }
}

async function organizationWithSubscription(
  status = 'active',
  priceId = 'price_solo_monthly',
) {
  const { organization } = await createTestUser()

  await systemPrisma.organization.update({
    where: { id: organization.id },
    data: { stripeCustomerId: 'cus_x' },
  })

  await systemPrisma.subscription.create({
    data: {
      organizationId: organization.id,
      stripeSubscriptionId: `sub_${organization.id}`,
      stripeCustomerId: 'cus_x',
      status,
      priceId,
    },
  })

  return organization
}

describe('previewPlanChange', () => {
  it('sem assinatura mostra o valor de tabela e não inventa proração', async () => {
    const { organization } = await createTestUser()
    const { port, previews } = fakePreview()

    const preview = await previewPlanChange(
      organization.id,
      'banca',
      'monthly',
      port,
      plans,
    )

    expect(preview.planAmountCents).toBe(20_000)
    expect(preview.amountDueCents).toBeNull()
    expect(preview.prorated).toBe(false)
    expect(previews).toHaveLength(0)
  })

  it('assinatura em status não cobrável cai no valor de tabela', async () => {
    const organization = await organizationWithSubscription('canceled')
    const { port, previews } = fakePreview()

    const preview = await previewPlanChange(
      organization.id,
      'banca',
      'monthly',
      port,
      plans,
    )

    expect(preview.prorated).toBe(false)
    expect(previews).toHaveLength(0)
  })

  it('o valor cobrado vem do Stripe, não de conta local', async () => {
    const organization = await organizationWithSubscription()
    const { port } = fakePreview(4_321)

    const preview = await previewPlanChange(
      organization.id,
      'banca',
      'monthly',
      port,
      plans,
    )

    // 4321 não é o preço de tabela de propósito: o que a tela mostra é o que o
    // Stripe diz que vai cobrar.
    expect(preview.amountDueCents).toBe(4_321)
    expect(preview.prorated).toBe(true)
  })

  it('subida de plano prevê cobrança imediata', async () => {
    const organization = await organizationWithSubscription()
    const { port, previews } = fakePreview()

    await previewPlanChange(organization.id, 'banca', 'monthly', port, plans)

    expect(previews).toEqual([
      { priceId: 'price_banca_monthly', prorationBehavior: 'always_invoice' },
    ])
  })

  it('descida de plano prevê crédito, não cobrança', async () => {
    const organization = await organizationWithSubscription(
      'active',
      'price_banca_monthly',
    )
    const { port, previews } = fakePreview()

    await previewPlanChange(organization.id, 'solo', 'monthly', port, plans)

    expect(previews[0].prorationBehavior).toBe('create_prorations')
  })

  it('assinatura sem item no Stripe cai no valor de tabela', async () => {
    const organization = await organizationWithSubscription()
    const semItem: PlanPreviewPort = {
      async readPlanItem() {
        return null
      },
      async previewInvoice() {
        throw new Error('não deveria ser chamado')
      },
    }

    const preview = await previewPlanChange(
      organization.id,
      'banca',
      'monthly',
      semItem,
      plans,
    )

    expect(preview.amountDueCents).toBeNull()
    expect(preview.prorated).toBe(false)
  })

  it('status local velho não vira erro: cai no valor de tabela e acerta a cópia', async () => {
    // O caso real: webhook de cancelamento nunca chegou, o banco ainda diz
    // `active` e o Stripe recusa prever fatura de assinatura cancelada.
    const organization = await organizationWithSubscription()
    const { port, previews } = fakePreview(12_345, 'canceled')

    const preview = await previewPlanChange(
      organization.id,
      'banca',
      'monthly',
      port,
      plans,
    )

    expect(preview.amountDueCents).toBeNull()
    expect(preview.prorated).toBe(false)
    expect(previews).toHaveLength(0)

    const saved = await systemPrisma.subscription.findFirstOrThrow({
      where: { organizationId: organization.id },
      select: { status: true },
    })

    expect(saved.status).toBe('canceled')
  })

  it('recusa plano que o catálogo não publica', async () => {
    const { organization } = await createTestUser()
    const { port } = fakePreview()

    await expect(
      previewPlanChange(organization.id, 'max', 'monthly', port, plans),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('recusa intervalo que o plano não publica', async () => {
    const { organization } = await createTestUser()
    const { port } = fakePreview()

    const soMensal: PlansPort = {
      async readPlanPrices() {
        return {
          plans: planPrices('banca', 5, 2).filter(
            (price) => price.interval === 'monthly',
          ),
          extras: [],
        }
      },
    }

    await expect(
      previewPlanChange(organization.id, 'banca', 'yearly', port, soMensal),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('propaga a falha do Stripe em vez de mostrar valor chutado', async () => {
    const organization = await organizationWithSubscription()
    const quebrado: PlanPreviewPort = {
      async readPlanItem() {
        return { itemId: 'si_1', status: 'active' }
      },
      async previewInvoice() {
        throw new Error('stripe fora')
      },
    }

    await expect(
      previewPlanChange(organization.id, 'banca', 'monthly', quebrado, plans),
    ).rejects.toThrow()
  })
})
