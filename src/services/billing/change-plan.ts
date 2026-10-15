import { systemPrisma } from 'prisma/prisma'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { stripe } from '@/lib/stripe'
import {
  type Plan,
  type PlanCode,
  type PlanInterval,
  type PlansPort,
  planByCode,
} from './list-plans'
import { assertPlanFitsMembers, currentPlan } from './plan-access'
import {
  isBillableStatus,
  reconcileSubscriptionStatus,
} from './subscription-status'
import { syncExtraMembers } from './sync-extra-members'

/**
 * Troca o plano do escritório.
 *
 * Diferente de um contador, isto é **decisão** — alguém clicou para gastar mais
 * (ou menos). Por isso a falha do Stripe propaga: uma tela que avisa que a troca
 * não aconteceu é melhor que uma que diz "pronto" e cobra o valor antigo.
 */

export type ProrationBehavior = 'always_invoice' | 'create_prorations'

/**
 * O pedaço do Stripe de que a troca depende, atrás de uma interface — mesma
 * razão das outras portas deste diretório: o alias de teste do repo duplica
 * instâncias de módulo, então `vi.mock` não é confiável aqui.
 */
export type PlanBillingPort = {
  /**
   * Item do plano **e** status remoto — o status local é cópia que chega por
   * webhook, e o Stripe recusa alterar assinatura cancelada.
   *
   * `null` quando a assinatura não existe mais no Stripe.
   */
  readPlanItem(
    subscriptionId: string,
  ): Promise<{ itemId: string; priceId: string; status: string } | null>
  swapPrice(input: {
    subscriptionId: string
    itemId: string
    priceId: string
    prorationBehavior: ProrationBehavior
  }): Promise<void>
}

/**
 * O item do **plano**, não o primeiro da lista.
 *
 * A assinatura pode ter dois itens desde a API pública medida, e a ordem de
 * `items.data` não é contrato. Trocar o preço do índice 0 às cegas poderia
 * substituir o item medido pelo plano e apagar a cobrança de uso.
 *
 * Plano é `usage_type: 'licensed'`; uso medido é `'metered'`.
 */
export function pickPlanItem<
  T extends { price?: { recurring?: { usage_type?: string } | null } | null },
>(items: T[]): T | undefined {
  return (
    items.find((item) => item.price?.recurring?.usage_type === 'licensed') ??
    items.find((item) => item.price?.recurring?.usage_type !== 'metered')
  )
}

export const stripePlanBilling: PlanBillingPort = {
  async readPlanItem(subscriptionId) {
    const remote = await stripe.subscriptions.retrieve(subscriptionId)
    const item = pickPlanItem(remote.items.data)

    if (!item) return null

    return {
      itemId: item.id,
      priceId: item.price?.id ?? '',
      status: remote.status,
    }
  },

  async swapPrice({ subscriptionId, itemId, priceId, prorationBehavior }) {
    await stripe.subscriptions.update(subscriptionId, {
      // `quantity: 1` explícito: o plano cobre o escritório inteiro, e herdar a
      // quantidade do modelo de assento cobraria o plano vezes o número de
      // pessoas.
      items: [{ id: itemId, price: priceId, quantity: 1 }],
      proration_behavior: prorationBehavior,
    })
  },
}

export type ChangePlanResult = {
  plan: Plan
  interval: PlanInterval
  /** `false` quando ainda não há assinatura: a escolha só ficou guardada. */
  subscriptionUpdated: boolean
}

export async function changePlan(
  organizationId: string,
  code: PlanCode,
  interval: PlanInterval,
  billing: PlanBillingPort = stripePlanBilling,
  port?: PlansPort,
): Promise<ChangePlanResult> {
  const target = await planByCode(code, port)

  if (!target) {
    throw new ConflictException('Plano indisponível no momento')
  }

  const price = target[interval]

  if (!price) {
    throw new ConflictException(
      `O plano ${target.name} não tem cobrança ${
        interval === 'yearly' ? 'anual' : 'mensal'
      }`,
    )
  }

  await assertPlanFitsMembers(organizationId, target)

  const before = await currentPlan(organizationId, port)

  const organization = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      subscription: { select: { stripeSubscriptionId: true, status: true } },
    },
  })

  // A escolha é gravada antes da chamada ao Stripe porque ela também vale para
  // a organização em trial, que ainda não tem assinatura para atualizar.
  await systemPrisma.organization.update({
    where: { id: organizationId },
    data: { planCode: code },
  })

  const subscription = organization?.subscription

  if (!subscription || !isBillableStatus(subscription.status)) {
    return { plan: target, interval, subscriptionUpdated: false }
  }

  const item = await billing.readPlanItem(subscription.stripeSubscriptionId)

  if (!item) {
    return { plan: target, interval, subscriptionUpdated: false }
  }

  // Status local velho (webhook perdido) não deve virar erro de cobrança: o
  // `planCode` já foi gravado acima, então a escolha vale quando a assinatura
  // voltar — e a cópia desatualizada é acertada aqui.
  if (!isBillableStatus(item.status)) {
    await reconcileSubscriptionStatus(organizationId, item.status)

    return { plan: target, interval, subscriptionUpdated: false }
  }

  if (item.priceId === price.priceId) {
    return { plan: target, interval, subscriptionUpdated: false }
  }

  const isUpgrade = (before?.plan.rank ?? 0) < target.rank

  await billing.swapPrice({
    subscriptionId: subscription.stripeSubscriptionId,
    itemId: item.itemId,
    priceId: price.priceId,
    // Subida cobra na hora; descida vira crédito na próxima fatura, sem
    // devolução. Mesma regra que o modelo de assento já usava.
    prorationBehavior: isUpgrade ? 'always_invoice' : 'create_prorations',
  })

  await systemPrisma.subscription.updateMany({
    where: { organizationId },
    data: { priceId: price.priceId },
  })

  // O teto mudou, então o excedente mudou junto: subir de plano pode zerar o
  // item de advogado adicional, e descer pode criá-lo.
  await syncExtraMembers(organizationId, undefined, port)

  return { plan: target, interval, subscriptionUpdated: true }
}
