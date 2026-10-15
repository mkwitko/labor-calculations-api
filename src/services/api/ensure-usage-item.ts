import { systemPrisma } from 'prisma/prisma'
import { env } from '@/env'
import { stripe } from '@/lib/stripe'

/**
 * O pedaço do Stripe necessário para garantir o item medido na assinatura,
 * atrás de uma interface — mesmo motivo de `SeatBillingPort`: o alias de teste
 * deste repo duplica instâncias de módulo e `vi.mock` não é confiável.
 */
export type UsageItemPort = {
  listItems(
    subscriptionId: string,
  ): Promise<Array<{ id: string; priceId: string | null }>>
  attachItem(input: { subscriptionId: string; priceId: string }): Promise<void>
}

const realUsageItem: UsageItemPort = {
  async listItems(subscriptionId) {
    const remote = await stripe.subscriptions.retrieve(subscriptionId)

    return remote.items.data.map((item) => ({
      id: item.id,
      priceId: item.price?.id ?? null,
    }))
  },

  async attachItem({ subscriptionId, priceId }) {
    await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: priceId,
      // Item medido nasce sem uso: nada a ratear, e nenhuma cobrança agora.
      proration_behavior: 'none',
    })
  },
}

/**
 * Em `ENV=test` o default não fala com o Stripe. `src/env` carrega o `.env` por
 * baixo, então a chave e o preço existem durante a suíte: sem este desvio, todo
 * teste que emitisse chave faria chamada de rede. Quem exercita a regra injeta
 * a porta (`ensure-usage-item.test.ts`).
 */
const noopUsageItem: UsageItemPort = {
  async listItems() {
    return []
  },
  async attachItem() {},
}

export const stripeUsageItem: UsageItemPort =
  env.ENV === 'test' ? noopUsageItem : realUsageItem

export type EnsureUsageItemResult = 'created' | 'present' | 'skipped'

/**
 * Garante que a assinatura da organização tenha o item de uso medido — é ele
 * que transforma os eventos do medidor em linha de fatura.
 *
 * Idempotente e sem efeito colateral de cobrança: preço por faixa sem uso soma
 * R$ 0,00. Por isso pode ser chamada de qualquer lugar, quantas vezes for.
 *
 * `skipped` cobre os dois casos legítimos de não fazer nada: preço não
 * configurado no ambiente, e organização que ainda não tem assinatura (trial).
 * Lança se o Stripe falhar — quem chama decide se isso derruba a operação.
 */
export async function ensureApiUsageItem(
  organizationId: string,
  priceId: string | undefined,
  port: UsageItemPort = stripeUsageItem,
): Promise<EnsureUsageItemResult> {
  if (!priceId) return 'skipped'

  const subscription = await systemPrisma.subscription.findUnique({
    where: { organizationId },
    select: { stripeSubscriptionId: true },
  })

  if (!subscription?.stripeSubscriptionId) return 'skipped'

  const items = await port.listItems(subscription.stripeSubscriptionId)

  if (items.some((item) => item.priceId === priceId)) return 'present'

  await port.attachItem({
    subscriptionId: subscription.stripeSubscriptionId,
    priceId,
  })

  return 'created'
}
