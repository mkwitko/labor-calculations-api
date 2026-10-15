import { systemPrisma } from 'prisma/prisma'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { stripe } from '@/lib/stripe'
import type { ProrationBehavior } from './change-plan'
import {
  type PlanCode,
  type PlanInterval,
  type PlansPort,
  planByCode,
} from './list-plans'
import { currentPlan } from './plan-access'
import {
  isBillableStatus,
  reconcileSubscriptionStatus,
} from './subscription-status'

export type PlanPreview = {
  code: PlanCode
  interval: PlanInterval
  /** Valor de tabela do plano, sempre legível mesmo sem assinatura. */
  planAmountCents: number
  /** O que a troca cobra agora; `null` quando não há assinatura para proratear. */
  amountDueCents: number | null
  currency: string
  prorated: boolean
}

/**
 * O que o preview precisa do Stripe, atrás de interface — mesma razão das outras
 * portas deste diretório.
 */
export type PlanPreviewPort = {
  /**
   * Item do plano **e** status remoto. O status vem junto porque o do banco é
   * cópia que chega por webhook: prever fatura de assinatura que o Stripe já
   * cancelou é erro garantido, e a única fonte confiável é esta chamada.
   *
   * `null` quando a assinatura não existe mais no Stripe.
   */
  readPlanItem(
    subscriptionId: string,
  ): Promise<{ itemId: string | null; status: string } | null>
  previewInvoice(input: {
    customerId: string
    subscriptionId: string
    itemId: string
    priceId: string
    prorationBehavior: ProrationBehavior
  }): Promise<{ amountDueCents: number; currency: string }>
}

export const stripePlanPreview: PlanPreviewPort = {
  async readPlanItem(subscriptionId) {
    const remote = await stripe.subscriptions.retrieve(subscriptionId)
    const item =
      remote.items.data.find(
        (candidate) => candidate.price?.recurring?.usage_type === 'licensed',
      ) ?? remote.items.data[0]

    return { itemId: item?.id ?? null, status: remote.status }
  },

  async previewInvoice({
    customerId,
    subscriptionId,
    itemId,
    priceId,
    prorationBehavior,
  }) {
    const preview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: subscriptionId,
      subscription_details: {
        items: [{ id: itemId, price: priceId, quantity: 1 }],
        proration_behavior: prorationBehavior,
      },
    })

    return { amountDueCents: preview.amount_due, currency: preview.currency }
  },
}

/**
 * Quanto custa mudar para um plano.
 *
 * O valor vem de `invoices.createPreview`, não de conta local: recalcular por
 * fora garante divergir do Stripe em algum arredondamento, e um dialog de
 * confirmação com valor diferente do cobrado vira reclamação de cobrança.
 *
 * Propaga a falha do Stripe de propósito — é consulta, não efeito, e uma tela
 * que avisa é melhor que uma que mostra número errado.
 */
export async function previewPlanChange(
  organizationId: string,
  code: PlanCode,
  interval: PlanInterval,
  port: PlanPreviewPort = stripePlanPreview,
  plansPort?: PlansPort,
): Promise<PlanPreview> {
  const target = await planByCode(code, plansPort)

  if (!target) throw new ConflictException('Plano indisponível no momento')

  const price = target[interval]

  if (!price) {
    throw new ConflictException(
      `O plano ${target.name} não tem cobrança ${
        interval === 'yearly' ? 'anual' : 'mensal'
      }`,
    )
  }

  const base = {
    code,
    interval,
    planAmountCents: price.amountCents,
    currency: target.currency,
  }

  const organization = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      stripeCustomerId: true,
      subscription: { select: { stripeSubscriptionId: true, status: true } },
    },
  })

  const subscription = organization?.subscription

  // Sem assinatura viva não há proração a mostrar. A tela mostra o valor de
  // tabela e diz que a cobrança começa na contratação — melhor que receber erro
  // por ainda não ter cadastrado pagamento.
  if (
    !organization?.stripeCustomerId ||
    !subscription ||
    !isBillableStatus(subscription.status)
  ) {
    return { ...base, amountDueCents: null, prorated: false }
  }

  const remote = await port.readPlanItem(subscription.stripeSubscriptionId)

  if (!remote) return { ...base, amountDueCents: null, prorated: false }

  // O status local pode estar velho — webhook perdido, ambiente sem webhook. Aí
  // o Stripe recusa prever fatura de assinatura cancelada e a tela toda quebra
  // por causa de uma cópia desatualizada: vale mais mostrar valor de tabela e
  // acertar a cópia.
  if (!isBillableStatus(remote.status)) {
    await reconcileSubscriptionStatus(organizationId, remote.status)

    return { ...base, amountDueCents: null, prorated: false }
  }

  const itemId = remote.itemId

  if (!itemId) return { ...base, amountDueCents: null, prorated: false }

  const before = await currentPlan(organizationId, plansPort)
  const isUpgrade = (before?.plan.rank ?? 0) < target.rank

  const { amountDueCents, currency } = await port.previewInvoice({
    customerId: organization.stripeCustomerId,
    subscriptionId: subscription.stripeSubscriptionId,
    itemId,
    priceId: price.priceId,
    prorationBehavior: isUpgrade ? 'always_invoice' : 'create_prorations',
  })

  return { ...base, currency, amountDueCents, prorated: true }
}
