import type {
  PlanCode,
  PlanInterval,
  PlansPort,
  RawExtraPrice,
  RawPlanPrice,
} from '@/services/billing/list-plans'

/**
 * Catálogo de planos de mentira, para os testes não dependerem de a conta do
 * Stripe responder nem do que está configurado nela hoje.
 */

const INTERVALS: PlanInterval[] = ['monthly', 'yearly']

export function planPrices(
  code: PlanCode,
  maxMembers: number,
  rank: number,
  allowsExtraMembers = false,
): RawPlanPrice[] {
  return INTERVALS.map((interval) => ({
    priceId: `price_${code}_${interval}`,
    amountCents: 10_000 * rank * (interval === 'yearly' ? 9 : 1),
    currency: 'brl',
    code,
    interval,
    name: `LexLaboral ${code}`,
    maxMembers,
    rank,
    allowsExtraMembers,
  }))
}

export function extraPrices(): RawExtraPrice[] {
  return INTERVALS.map((interval) => ({
    priceId: `price_extra_${interval}`,
    amountCents: interval === 'yearly' ? 35_100 : 3_900,
    currency: 'brl',
    interval,
  }))
}

/** Solo e Banca com teto rígido; Escritório aceita excedente pago. */
export const CATALOG_PLANS: RawPlanPrice[] = [
  ...planPrices('solo', 1, 1),
  ...planPrices('banca', 5, 2),
  ...planPrices('escritorio', 15, 3, true),
]

export function fakePlansPort(
  plans: RawPlanPrice[] = CATALOG_PLANS,
  extras: RawExtraPrice[] = extraPrices(),
): { port: PlansPort; calls: () => number } {
  let calls = 0

  return {
    port: {
      async readPlanPrices() {
        calls += 1

        return { plans, extras }
      },
    },
    calls: () => calls,
  }
}
