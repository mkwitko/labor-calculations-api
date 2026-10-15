import { systemPrisma } from 'prisma/prisma'
import { stripe } from '@/lib/stripe'
import { loadCatalog, type PlanInterval, type PlansPort } from './list-plans'
import { currentPlan, planOccupancy } from './plan-access'
import { isBillableStatus } from './subscription-status'

/**
 * O excedente do teto vira um **segundo item** na assinatura: o preço do
 * advogado adicional, com quantidade igual ao número de pessoas acima do teto.
 *
 * É projeção, como o contador de membros: o valor é sempre recalculado do zero,
 * nunca incrementado, então repetir a chamada converge. Por isso **não lança** —
 * aceitar convite não pode falhar porque o Stripe está fora — e por isso existe
 * o cron de reconciliação, que fecha a lacuna de uma chamada perdida.
 */

export type ExtraMemberItem = {
  itemId: string
  priceId: string
  quantity: number
}

export type ExtraMemberBillingPort = {
  /** `null` quando a assinatura não existe mais no Stripe. */
  readItems(subscriptionId: string): Promise<ExtraMemberItem[] | null>
  addItem(input: {
    subscriptionId: string
    priceId: string
    quantity: number
  }): Promise<void>
  updateItem(input: { itemId: string; quantity: number }): Promise<void>
  removeItem(input: { itemId: string }): Promise<void>
}

export const stripeExtraMemberBilling: ExtraMemberBillingPort = {
  async readItems(subscriptionId) {
    const remote = await stripe.subscriptions.retrieve(subscriptionId)

    if (!remote.items?.data) return null

    return remote.items.data.map((item) => ({
      itemId: item.id,
      priceId: item.price?.id ?? '',
      quantity: item.quantity ?? 0,
    }))
  },

  async addItem({ subscriptionId, priceId, quantity }) {
    await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: priceId,
      quantity,
      // Entrou gente no meio do ciclo: cobra o proporcional agora, mesma regra
      // da subida de plano.
      proration_behavior: 'always_invoice',
    })
  },

  async updateItem({ itemId, quantity }) {
    await stripe.subscriptionItems.update(itemId, {
      quantity,
      proration_behavior: 'always_invoice',
    })
  },

  async removeItem({ itemId }) {
    // Saiu gente: vira crédito na próxima fatura, sem devolução.
    await stripe.subscriptionItems.del(itemId, {
      proration_behavior: 'create_prorations',
    })
  },
}

export type SyncExtraResult = {
  extraMembers: number
  stripeUpdated: boolean
}

export async function syncExtraMembers(
  organizationId: string,
  billing: ExtraMemberBillingPort = stripeExtraMemberBilling,
  plansPort?: PlansPort,
): Promise<SyncExtraResult> {
  try {
    const occupancy = await planOccupancy(organizationId, plansPort)

    if (!occupancy) return { extraMembers: 0, stripeUpdated: false }

    const wanted = occupancy.allowsExtraMembers ? occupancy.extraMembers : 0

    const organization = await systemPrisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        subscription: { select: { stripeSubscriptionId: true, status: true } },
      },
    })

    const subscription = organization?.subscription

    if (!subscription || !isBillableStatus(subscription.status)) {
      return { extraMembers: wanted, stripeUpdated: false }
    }

    const catalog = await loadCatalog(plansPort)
    const current = await currentPlan(organizationId, plansPort)

    // Sem intervalo conhecido o excedente seguiria o do plano mensal por
    // omissão, e uma assinatura anual ganharia um item mensal ao lado.
    const interval: PlanInterval = current?.interval ?? 'monthly'
    const extraPrice = catalog.extraMember[interval]

    if (!extraPrice) return { extraMembers: wanted, stripeUpdated: false }

    const extraPriceIds = new Set(
      [catalog.extraMember.monthly, catalog.extraMember.yearly]
        .filter((price) => price !== null)
        .map((price) => price.priceId),
    )

    const items = await billing.readItems(subscription.stripeSubscriptionId)

    if (!items) return { extraMembers: wanted, stripeUpdated: false }

    const existing = items.find((item) => extraPriceIds.has(item.priceId))

    if (!existing) {
      if (wanted === 0) return { extraMembers: 0, stripeUpdated: false }

      await billing.addItem({
        subscriptionId: subscription.stripeSubscriptionId,
        priceId: extraPrice.priceId,
        quantity: wanted,
      })

      return { extraMembers: wanted, stripeUpdated: true }
    }

    if (wanted === 0) {
      await billing.removeItem({ itemId: existing.itemId })

      return { extraMembers: 0, stripeUpdated: true }
    }

    // Item existente com o preço do intervalo errado (o escritório trocou mensal
    // por anual): troca-se removendo e recriando, porque `price` de item não
    // muda de intervalo no mesmo ciclo.
    if (existing.priceId !== extraPrice.priceId) {
      await billing.removeItem({ itemId: existing.itemId })
      await billing.addItem({
        subscriptionId: subscription.stripeSubscriptionId,
        priceId: extraPrice.priceId,
        quantity: wanted,
      })

      return { extraMembers: wanted, stripeUpdated: true }
    }

    if (existing.quantity === wanted) {
      return { extraMembers: wanted, stripeUpdated: false }
    }

    await billing.updateItem({ itemId: existing.itemId, quantity: wanted })

    return { extraMembers: wanted, stripeUpdated: true }
  } catch (error) {
    console.error('syncExtraMembers: falha ao ajustar excedente no Stripe', {
      organizationId,
      error,
    })

    return { extraMembers: 0, stripeUpdated: false }
  }
}

/**
 * Passada de reconciliação: `syncExtraMembers` não lança de propósito, então uma
 * chamada perdida deixaria a assinatura cobrando o excedente errado até a
 * próxima mudança de equipe. Repetir é seguro — cada chamada é projeção de uma
 * contagem.
 */
export async function reconcileExtraMembers(
  billing: ExtraMemberBillingPort = stripeExtraMemberBilling,
): Promise<{ checked: number; updated: number }> {
  const organizations = await systemPrisma.organization.findMany({
    where: { subscription: { isNot: null }, deletedAt: null },
    select: { id: true },
  })

  let updated = 0

  for (const { id } of organizations) {
    const result = await syncExtraMembers(id, billing)

    if (result.stripeUpdated) updated += 1
  }

  return { checked: organizations.length, updated }
}
