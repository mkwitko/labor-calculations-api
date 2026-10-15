import { systemPrisma } from 'prisma/prisma'
import { env } from '@/env'
import { stripe } from '@/lib/stripe'

/**
 * Quanto a organização já usou da API neste ciclo.
 *
 * Existe porque a chave só mostrava `lastUsedAt`: quem integra não tinha como
 * saber quantas chamadas fez nem quanto ia pagar, e descobrir isso na fatura é
 * tarde.
 */

export type UsageTier = {
  /** `null` na última faixa, que não tem teto. */
  upTo: number | null
  unitAmountCents: number
  flatAmountCents: number
}

/**
 * O preço por faixa, atrás de interface — mesma razão das portas de billing: o
 * alias de teste deste repo duplica instâncias de módulo e `vi.mock` não é
 * confiável aqui.
 */
export type UsagePricePort = {
  /** `null` quando o preço não é legível: aí a tela mostra só a contagem. */
  readTiers(priceId: string): Promise<{
    currency: string
    tiers: UsageTier[]
  } | null>
}

/**
 * A forma mínima que interessa de um preço com faixas expandidas, escrita à mão
 * pelo mesmo motivo de `ExpandedStripePrice` em `list-plans.ts`: este projeto
 * resolve o pacote pela entrada CJS, onde o namespace `Stripe` não existe.
 */
type ExpandedTieredPrice = {
  currency: string
  tiers?: Array<{
    up_to: number | null
    unit_amount_decimal?: string | null
    flat_amount?: number | null
  }> | null
}

export const stripeUsagePrice: UsagePricePort = {
  async readTiers(priceId) {
    try {
      const price = (await stripe.prices.retrieve(priceId, {
        expand: ['tiers'],
      })) as unknown as ExpandedTieredPrice

      const tiers = (price.tiers ?? []).map((tier) => ({
        upTo: typeof tier.up_to === 'number' ? tier.up_to : null,
        unitAmountCents: Number(tier.unit_amount_decimal ?? 0),
        flatAmountCents: tier.flat_amount ?? 0,
      }))

      if (tiers.length === 0) return null

      return { currency: price.currency, tiers }
    } catch {
      // Preço ilegível não é erro da tela: ela mostra a contagem e cala sobre o
      // valor.
      return null
    }
  },
}

/** Em `ENV=test` o default é mudo: nenhuma chamada de rede na suíte. */
const offlineUsagePrice: UsagePricePort = {
  async readTiers() {
    return null
  },
}

const defaultPort: UsagePricePort =
  env.ENV === 'test' ? offlineUsagePrice : stripeUsagePrice

export type ApiUsageSummary = {
  periodStart: Date
  periodEnd: Date
  /** Chamadas cobráveis (chave `live`) no ciclo. */
  total: number
  /** Chamadas de teste no ciclo. Informativas: não entram na fatura. */
  testTotal: number
  /** Cobráveis ainda não reportadas ao medidor do Stripe. */
  pending: number
  estimatedCents: number | null
  currency: string | null
  byKey: Array<{
    id: string
    name: string
    prefix: string
    mode: 'live' | 'test'
    calls: number
  }>
}

/**
 * O ciclo é o da assinatura quando ela existe — é nele que a fatura fecha. Sem
 * assinatura (trial), o mês corrente: é o recorte que a pessoa espera ver.
 */
function cycleFor(
  now: Date,
  currentPeriodEnd: Date | null,
): { periodStart: Date; periodEnd: Date } {
  if (currentPeriodEnd && currentPeriodEnd > now) {
    const periodStart = new Date(currentPeriodEnd)
    periodStart.setUTCMonth(periodStart.getUTCMonth() - 1)

    return { periodStart, periodEnd: currentPeriodEnd }
  }

  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  )

  return { periodStart, periodEnd }
}

/** Soma por faixa, do jeito que o Stripe cobra `graduated`. */
export function estimateCents(calls: number, tiers: UsageTier[]): number {
  let remaining = calls
  let consumed = 0
  let total = 0

  for (const tier of tiers) {
    if (remaining <= 0) break

    const capacity =
      tier.upTo === null ? remaining : Math.max(0, tier.upTo - consumed)
    const billed = Math.min(remaining, capacity)

    if (billed <= 0) continue

    total += billed * tier.unitAmountCents + tier.flatAmountCents
    remaining -= billed
    consumed += billed
  }

  return Math.round(total)
}

export async function summarizeApiUsage(
  organizationId: string,
  port: UsagePricePort = defaultPort,
  now: Date = new Date(),
): Promise<ApiUsageSummary> {
  const organization = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: { subscription: { select: { currentPeriodEnd: true } } },
  })

  const { periodStart, periodEnd } = cycleFor(
    now,
    organization?.subscription?.currentPeriodEnd ?? null,
  )

  const keys = await systemPrisma.apiKey.findMany({
    where: { organizationId },
    select: { id: true, name: true, prefix: true, mode: true },
    orderBy: { createdAt: 'desc' },
  })

  const grouped = await systemPrisma.apiUsage.groupBy({
    by: ['apiKeyId'],
    where: {
      organizationId,
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    _count: { _all: true },
  })

  const callsByKey = new Map(
    grouped.map((row) => [row.apiKeyId, row._count._all]),
  )

  const byKey = keys
    .map((key) => ({ ...key, calls: callsByKey.get(key.id) ?? 0 }))
    .filter((key) => key.calls > 0)

  const total = byKey
    .filter((key) => key.mode === 'live')
    .reduce((sum, key) => sum + key.calls, 0)

  const testTotal = byKey
    .filter((key) => key.mode === 'test')
    .reduce((sum, key) => sum + key.calls, 0)

  const pending = await systemPrisma.apiUsage.count({
    where: {
      organizationId,
      reportedAt: null,
      createdAt: { gte: periodStart, lt: periodEnd },
      apiKey: { mode: 'live' },
    },
  })

  // Ambiente sem preço de uso configurado mostra só a contagem: a alternativa
  // seria inventar um valor.
  const priceId = env.STRIPE_PRICE_ID_API
  const price = priceId ? await port.readTiers(priceId) : null

  return {
    periodStart,
    periodEnd,
    total,
    testTotal,
    pending,
    estimatedCents: price ? estimateCents(total, price.tiers) : null,
    currency: price?.currency ?? null,
    byKey,
  }
}
