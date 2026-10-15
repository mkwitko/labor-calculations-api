import { systemPrisma } from 'prisma/prisma'
import { env } from '@/env'
import { stripe } from '@/lib/stripe'
import {
  ensureApiUsageItem,
  stripeUsageItem,
  type UsageItemPort,
} from './ensure-usage-item'

/**
 * O pedaço do Stripe de que o reporte de uso depende, atrás de uma interface —
 * mesmo motivo de `SeatBillingPort`: o setup de Vitest deste repo resolve `@/`
 * por dois caminhos e `vi.mock` não é confiável aqui.
 */
export type UsageBillingPort = {
  reportUsage(input: {
    customerId: string
    quantity: number
    /** Torna o reporte idempotente: repetir o dia não cobra de novo. */
    identifier: string
  }): Promise<void>
}

export const stripeUsageBilling: UsageBillingPort = {
  async reportUsage({ customerId, quantity, identifier }) {
    await stripe.billing.meterEvents.create({
      event_name: env.STRIPE_API_METER_EVENT,
      payload: {
        stripe_customer_id: customerId,
        value: String(quantity),
      },
      identifier,
    })
  },
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * Passada diária: agrega o uso ainda não reportado por organização e manda ao
 * medidor. Nada é descartado — organização sem assinatura, ou Stripe fora do
 * ar, deixa as linhas pendentes para o ciclo seguinte.
 */
export async function reportPendingApiUsage(
  now: Date,
  billing: UsageBillingPort = stripeUsageBilling,
  usageItem: UsageItemPort = stripeUsageItem,
): Promise<{ organizations: number; reported: number; skipped: number }> {
  const groups = await systemPrisma.apiUsage.groupBy({
    by: ['organizationId'],
    where: { reportedAt: null },
    _count: { _all: true },
  })

  let reported = 0
  let skipped = 0

  for (const group of groups) {
    const subscription = await systemPrisma.subscription.findUnique({
      where: { organizationId: group.organizationId },
      select: { stripeCustomerId: true },
    })

    if (!subscription?.stripeCustomerId) {
      console.error('Uso de API sem assinatura para reportar', {
        organizationId: group.organizationId,
      })
      skipped++
      continue
    }

    // Congela o lote antes de reportar: uso que chegar durante a chamada entra
    // no ciclo seguinte, em vez de ser marcado sem ter sido contado.
    const batch = await systemPrisma.apiUsage.findMany({
      where: { organizationId: group.organizationId, reportedAt: null },
      select: { id: true },
    })

    try {
      // Antes de reportar, garante o item medido. É o que cobre organização
      // que emitiu chave em trial (sem assinatura para anexar na hora), que
      // pegou Stripe fora do ar no clique, que teve assinatura refeita, ou cuja
      // chave nasceu antes deste código. Idempotente: no caso normal é só uma
      // leitura.
      await ensureApiUsageItem(
        group.organizationId,
        env.STRIPE_PRICE_ID_API,
        usageItem,
      )

      await billing.reportUsage({
        customerId: subscription.stripeCustomerId,
        quantity: batch.length,
        identifier: `apiusage_${group.organizationId}_${dayKey(now)}`,
      })
    } catch (error) {
      console.error('Falha ao reportar uso de API ao Stripe', {
        organizationId: group.organizationId,
        error,
      })
      skipped++
      continue
    }

    await systemPrisma.apiUsage.updateMany({
      where: { id: { in: batch.map((row) => row.id) } },
      data: { reportedAt: now },
    })

    reported += batch.length
  }

  return { organizations: groups.length, reported, skipped }
}
