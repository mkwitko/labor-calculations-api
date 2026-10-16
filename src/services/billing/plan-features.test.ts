import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { clearPlansCache } from '@/services/billing/list-plans'
import {
  assertPlanFeature,
  checkPlanFeature,
  listPlanFeatures,
} from '@/services/billing/plan-features'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { fakePlansPort, planPrices } from '@/tests/helpers/plans'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  clearPlansCache()
  await cleanDatabase()
})

// O catálogo padrão dos testes não tem `max`; o gate da API pública precisa
// dele para ter um plano mínimo que exista.
const { port } = fakePlansPort([
  ...planPrices('solo', 1, 1),
  ...planPrices('banca', 5, 2),
  ...planPrices('escritorio', 15, 3, true),
  ...planPrices('max', 40, 4, true),
])

/** Organização assinante do plano `code` — assinatura, não trial. */
async function subscribedTo(code: string) {
  const { organization } = await createTestUser()

  await systemPrisma.subscription.create({
    data: {
      organizationId: organization.id,
      stripeSubscriptionId: `sub_${organization.id}`,
      stripeCustomerId: 'cus_x',
      status: 'active',
      priceId: `price_${code}_monthly`,
    },
  })

  return organization
}

describe('checkPlanFeature', () => {
  it('libera o recurso no plano em que ele entra', async () => {
    const organization = await subscribedTo('escritorio')

    const access = await checkPlanFeature(
      organization.id,
      'batch_assessment',
      port,
    )

    expect(access.allowed).toBe(true)
  })

  it('libera também acima do plano mínimo', async () => {
    const organization = await subscribedTo('max')

    const access = await checkPlanFeature(
      organization.id,
      'batch_assessment',
      port,
    )

    expect(access.allowed).toBe(true)
  })

  it('recusa abaixo do plano mínimo e diz qual é o plano', async () => {
    const organization = await subscribedTo('banca')

    const access = await checkPlanFeature(
      organization.id,
      'batch_assessment',
      port,
    )

    expect(access.allowed).toBe(false)
    expect(access.requiredPlan).toBe('escritorio')
    expect(access.requiredPlanName).toBe('LexLaboral escritorio')
  })

  it('a API pública só entra no plano máximo', async () => {
    const organization = await subscribedTo('escritorio')

    const access = await checkPlanFeature(organization.id, 'public_api', port)

    expect(access.allowed).toBe(false)
    expect(access.requiredPlan).toBe('max')
  })

  it('abre tudo enquanto a organização está em teste gratuito', async () => {
    // Sem assinatura, o plano vem da coluna. É justo o escritório grande que
    // precisa ver o lote antes de assinar.
    const { organization } = await createTestUser()

    const batch = await checkPlanFeature(
      organization.id,
      'batch_assessment',
      port,
    )
    const api = await checkPlanFeature(organization.id, 'public_api', port)

    expect(batch.allowed).toBe(true)
    expect(api.allowed).toBe(true)
  })

  it('não tranca o produto quando o catálogo não responde', async () => {
    const organization = await subscribedTo('solo')

    // Stripe fora do ar: mesma escolha do teto de pessoas — empacotamento é
    // regra comercial, não de segurança.
    const { port: emptyPort } = fakePlansPort([], [])

    const access = await checkPlanFeature(
      organization.id,
      'batch_assessment',
      emptyPort,
    )

    expect(access.allowed).toBe(true)
  })
})

describe('assertPlanFeature', () => {
  it('deixa passar quem tem direito', async () => {
    const organization = await subscribedTo('max')

    await expect(
      assertPlanFeature(organization.id, 'public_api', port),
    ).resolves.toBeUndefined()
  })

  it('responde 402 com o caminho da troca de plano', async () => {
    const organization = await subscribedTo('solo')

    await assertPlanFeature(organization.id, 'batch_assessment', port).then(
      () => {
        throw new Error('deveria ter recusado')
      },
      (error: { statusCode?: number; message?: string }) => {
        expect(error.statusCode).toBe(402)
        expect(error.message).toContain('LexLaboral escritorio')
      },
    )
  })
})

describe('listPlanFeatures', () => {
  it('devolve todos os recursos de uma vez, para a tela não oferecer o que não tem', async () => {
    const organization = await subscribedTo('escritorio')

    const features = await listPlanFeatures(organization.id, port)

    expect(features.batch_assessment.allowed).toBe(true)
    expect(features.public_api.allowed).toBe(false)
  })
})
