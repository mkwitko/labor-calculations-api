import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { clearPlansCache } from '@/services/billing/list-plans'
import {
  type ExtraMemberBillingPort,
  type ExtraMemberItem,
  reconcileExtraMembers,
  syncExtraMembers,
} from '@/services/billing/sync-extra-members'
import { cleanDatabase, createMember, createTestUser } from '@/tests/helpers/db'
import { fakePlansPort, planPrices } from '@/tests/helpers/plans'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  clearPlansCache()
  await cleanDatabase()
})

/**
 * Teto de 1 pessoa nos dois planos para o excedente aparecer com dois membros,
 * em vez de exigir dezesseis usuários de fixture. `escritorio` aceita excedente
 * pago; `solo` não.
 */
const { port: plans } = fakePlansPort([
  ...planPrices('solo', 1, 1),
  ...planPrices('escritorio', 1, 3, true),
])

function fakeBilling(items: ExtraMemberItem[] = []) {
  const calls: string[] = []
  const added: Array<{ priceId: string; quantity: number }> = []
  const updated: Array<{ itemId: string; quantity: number }> = []
  const removed: string[] = []

  const billing: ExtraMemberBillingPort = {
    async readItems() {
      calls.push('read')

      return items
    },
    async addItem({ priceId, quantity }) {
      calls.push('add')
      added.push({ priceId, quantity })
    },
    async updateItem({ itemId, quantity }) {
      calls.push('update')
      updated.push({ itemId, quantity })
    },
    async removeItem({ itemId }) {
      calls.push('remove')
      removed.push(itemId)
    },
  }

  return { billing, calls, added, updated, removed }
}

async function organization(
  priceId = 'price_escritorio_monthly',
  status = 'active',
) {
  const { organization: org } = await createTestUser()

  await systemPrisma.organization.update({
    where: { id: org.id },
    data: { planCode: 'escritorio' },
  })

  await systemPrisma.subscription.create({
    data: {
      organizationId: org.id,
      stripeSubscriptionId: `sub_${org.id}`,
      stripeCustomerId: 'cus_x',
      status,
      priceId,
    },
  })

  return org
}

const EXTRA_MONTHLY = 'price_extra_monthly'
const EXTRA_YEARLY = 'price_extra_yearly'

describe('syncExtraMembers', () => {
  it('cria o item de excedente com a quantidade acima do teto', async () => {
    const org = await organization()
    await createMember(org.id, 'lawyer')
    await createMember(org.id, 'lawyer')

    const { billing, added } = fakeBilling()
    const result = await syncExtraMembers(org.id, billing, plans)

    // 3 pessoas (titular + 2) num teto de 1 → 2 excedentes.
    expect(result).toEqual({ extraMembers: 2, stripeUpdated: true })
    expect(added).toEqual([{ priceId: EXTRA_MONTHLY, quantity: 2 }])
  })

  it('plano de teto rígido não ganha item de excedente', async () => {
    const org = await organization('price_solo_monthly')
    await createMember(org.id, 'lawyer')

    const { billing, calls } = fakeBilling()
    const result = await syncExtraMembers(org.id, billing, plans)

    // Aqui o caminho é subir de plano, não pagar avulso.
    expect(result.extraMembers).toBe(0)
    expect(calls).not.toContain('add')
  })

  it('ajusta a quantidade do item que já existe', async () => {
    const org = await organization()
    await createMember(org.id, 'lawyer')
    await createMember(org.id, 'lawyer')

    const { billing, updated } = fakeBilling([
      { itemId: 'si_extra', priceId: EXTRA_MONTHLY, quantity: 1 },
    ])

    const result = await syncExtraMembers(org.id, billing, plans)

    expect(result.stripeUpdated).toBe(true)
    expect(updated).toEqual([{ itemId: 'si_extra', quantity: 2 }])
  })

  it('remove o item quando ninguém mais passa do teto', async () => {
    const org = await organization()

    const { billing, removed } = fakeBilling([
      { itemId: 'si_extra', priceId: EXTRA_MONTHLY, quantity: 3 },
    ])

    const result = await syncExtraMembers(org.id, billing, plans)

    expect(result).toEqual({ extraMembers: 0, stripeUpdated: true })
    expect(removed).toEqual(['si_extra'])
  })

  it('recria o item quando o intervalo da assinatura mudou', async () => {
    const org = await organization('price_escritorio_yearly')
    await createMember(org.id, 'lawyer')

    const { billing, calls, added, removed } = fakeBilling([
      { itemId: 'si_extra', priceId: EXTRA_MONTHLY, quantity: 1 },
    ])

    await syncExtraMembers(org.id, billing, plans)

    // Item mensal ao lado de assinatura anual cobraria em ciclo errado.
    expect(calls).toEqual(['read', 'remove', 'add'])
    expect(removed).toEqual(['si_extra'])
    expect(added).toEqual([{ priceId: EXTRA_YEARLY, quantity: 1 }])
  })

  it('converge: quantidade já correta não toca no Stripe', async () => {
    const org = await organization()
    await createMember(org.id, 'lawyer')

    const { billing, calls } = fakeBilling([
      { itemId: 'si_extra', priceId: EXTRA_MONTHLY, quantity: 1 },
    ])

    const result = await syncExtraMembers(org.id, billing, plans)

    expect(result).toEqual({ extraMembers: 1, stripeUpdated: false })
    expect(calls).toEqual(['read'])
  })

  it('sem assinatura não fala com o Stripe', async () => {
    const { organization: org } = await createTestUser()

    await systemPrisma.organization.update({
      where: { id: org.id },
      data: { planCode: 'escritorio' },
    })

    await createMember(org.id, 'lawyer')

    const { billing, calls } = fakeBilling()
    const result = await syncExtraMembers(org.id, billing, plans)

    expect(result.stripeUpdated).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('não lança quando o Stripe está fora: convite não pode falhar por cobrança', async () => {
    const org = await organization()
    await createMember(org.id, 'lawyer')

    const quebrado: ExtraMemberBillingPort = {
      async readItems() {
        throw new Error('stripe fora')
      },
      async addItem() {},
      async updateItem() {},
      async removeItem() {},
    }

    const result = await syncExtraMembers(org.id, quebrado, plans)

    expect(result).toEqual({ extraMembers: 0, stripeUpdated: false })
  })

  it('catálogo sem preço de excedente não entrega gente de graça', async () => {
    const org = await organization()
    await createMember(org.id, 'lawyer')

    const { port: semExtra } = fakePlansPort(
      [...planPrices('escritorio', 1, 3, true)],
      [],
    )

    const { billing, calls } = fakeBilling()
    const result = await syncExtraMembers(org.id, billing, semExtra)

    // `allowsExtraMembers` fica falso sem preço, então não há item a criar.
    expect(result.extraMembers).toBe(0)
    expect(calls).not.toContain('add')
  })
})

describe('reconcileExtraMembers', () => {
  it('passa por toda organização com assinatura e conta o que mudou', async () => {
    const comExcedente = await organization()
    await createMember(comExcedente.id, 'lawyer')
    await organization()

    // A porta default é a offline em ENV=test; aqui o catálogo real do reconcile
    // é o de produção, então só se afere a varredura, não a quantidade.
    const { billing } = fakeBilling()
    const result = await reconcileExtraMembers(billing)

    expect(result.checked).toBe(2)
  })
})
