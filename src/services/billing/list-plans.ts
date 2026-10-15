import { env } from '@/env'
import { stripe } from '@/lib/stripe'
import { MS_PER_MINUTE } from '@/utils/constants'

/**
 * O escritório assina um **plano com teto de pessoas**, não um número de
 * assentos. E o plano vive no Stripe: preço e teto são inseparáveis — mudar um
 * sem o outro é vender cinco lugares cobrando por um —, então os dois vêm da
 * mesma fonte, o produto.
 *
 * Nada aqui é constante de código. Repetir o valor no front foi o que fez a
 * landing prometer R$ 97 enquanto a fatura cobrava R$ 100.
 */

export const PLAN_CODES = ['solo', 'banca', 'escritorio', 'max'] as const
export type PlanCode = (typeof PLAN_CODES)[number]

export const PLAN_INTERVALS = ['monthly', 'yearly'] as const
export type PlanInterval = (typeof PLAN_INTERVALS)[number]

/**
 * `lookup_key` em vez de id no ambiente: com quatro planos em dois intervalos
 * seriam oito variáveis para esquecer uma, e a chave é estável mesmo quando o
 * preço é recriado.
 */
export function lookupKey(code: PlanCode, interval: PlanInterval): string {
  return `plan_${code}_${interval}`
}

/**
 * O advogado adicional não é um plano: é o excedente do teto, cobrado por
 * cabeça nos planos que o permitem. Vive num produto próprio para poder virar um
 * segundo item da assinatura, com quantidade igual ao número de pessoas acima do
 * teto.
 */
export const EXTRA_MEMBER_LOOKUP_KEYS = PLAN_INTERVALS.map(
  (interval) => `plan_extra_member_${interval}`,
)

export const PLAN_LOOKUP_KEYS = [
  ...PLAN_CODES.flatMap((code) =>
    PLAN_INTERVALS.map((interval) => lookupKey(code, interval)),
  ),
  ...EXTRA_MEMBER_LOOKUP_KEYS,
]

export type PlanPrice = { priceId: string; amountCents: number }

export type Plan = {
  code: PlanCode
  name: string
  /** Teto de pessoas do escritório. Vem do produto, junto com o preço. */
  maxMembers: number
  /** Ordem comercial, do menor plano para o maior. */
  rank: number
  currency: string
  /**
   * Se o escritório pode passar do teto pagando por cabeça. Nos planos menores é
   * `false` — lá o caminho é subir de plano, que sai mais barato que o avulso.
   */
  allowsExtraMembers: boolean
  monthly: PlanPrice | null
  yearly: PlanPrice | null
}

export type ExtraMemberPrices = {
  monthly: PlanPrice | null
  yearly: PlanPrice | null
}

export type Catalog = {
  plans: Plan[]
  extraMember: ExtraMemberPrices
}

/** Um preço já lido do Stripe, antes de os dois intervalos virarem um plano. */
export type RawPlanPrice = {
  priceId: string
  amountCents: number
  currency: string
  code: PlanCode
  interval: PlanInterval
  name: string
  maxMembers: number
  rank: number
  allowsExtraMembers: boolean
}

/** O preço do excedente, que não pertence a plano nenhum. */
export type RawExtraPrice = {
  priceId: string
  amountCents: number
  currency: string
  interval: PlanInterval
}

/**
 * O pedaço do Stripe de que a listagem depende, atrás de uma interface. Existe
 * por testabilidade: o setup de Vitest deste repo resolve `@/` por dois caminhos
 * e produz instâncias de módulo distintas, então `vi.mock('@/lib/stripe')` não é
 * confiável aqui — injetar a porta é.
 */
export type PlansPort = {
  readPlanPrices(): Promise<{
    plans: RawPlanPrice[]
    extras: RawExtraPrice[]
  }>
}

function isPlanCode(value: string): value is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(value)
}

function isPlanInterval(value: string): value is PlanInterval {
  return (PLAN_INTERVALS as readonly string[]).includes(value)
}

/**
 * A forma mínima que interessa de um `Stripe.Price` com produto expandido.
 * Escrita à mão porque o pacote só publica o namespace `Stripe` na entrada ESM,
 * e este projeto resolve pela CJS — onde `Stripe.Price` não existe.
 */
export type ExpandedStripePrice = {
  id: string
  active?: boolean
  currency: string
  unit_amount: number | null
  metadata?: Record<string, string> | null
  product?:
    | string
    | null
    | {
        name?: string
        /** `unknown` porque o tipo do pacote declara `void` aqui. */
        deleted?: unknown
        metadata?: Record<string, string> | null
      }
}

/**
 * Preço vira `RawPlanPrice` só quando produto e metadados estão completos.
 * Preço meio configurado é omitido em vez de virar plano com teto zero, que
 * deixaria a organização sem poder convidar ninguém.
 */
export function toRawPlanPrice(
  price: ExpandedStripePrice,
): RawPlanPrice | null {
  if (!price.active || price.unit_amount === null) return null

  const product = price.product

  if (typeof product === 'string' || !product) return null
  if (product.deleted) return null

  const code = product.metadata?.code ?? ''
  const interval = price.metadata?.plan_interval ?? ''
  const maxMembers = Number(product.metadata?.max_members ?? '')
  const rank = Number(product.metadata?.rank ?? '')

  if (!isPlanCode(code) || !isPlanInterval(interval)) return null
  if (!Number.isInteger(maxMembers) || maxMembers < 1) return null

  return {
    priceId: price.id,
    amountCents: price.unit_amount,
    currency: price.currency,
    code,
    interval,
    name: product.name ?? code,
    maxMembers,
    rank: Number.isInteger(rank) ? rank : 0,
    allowsExtraMembers: product.metadata?.extra_members === 'true',
  }
}

/** O mesmo, para o preço do excedente — que não tem código nem teto. */
export function toRawExtraPrice(
  price: ExpandedStripePrice,
): RawExtraPrice | null {
  if (!price.active || price.unit_amount === null) return null

  const product = price.product

  if (typeof product === 'string' || !product) return null
  if (product.deleted || product.metadata?.jurispro !== 'extra_member') {
    return null
  }

  const interval = price.metadata?.plan_interval ?? ''

  if (!isPlanInterval(interval)) return null

  return {
    priceId: price.id,
    amountCents: price.unit_amount,
    currency: price.currency,
    interval,
  }
}

export const realPlansPort: PlansPort = {
  async readPlanPrices() {
    // `expand` do produto é obrigatório: teto e nome comercial moram lá, e sem
    // eles o preço sozinho não descreve um plano.
    const prices = await stripe.prices.list({
      lookup_keys: PLAN_LOOKUP_KEYS,
      active: true,
      expand: ['data.product'],
      limit: 100,
    })

    return {
      plans: prices.data
        .map(toRawPlanPrice)
        .filter((price): price is RawPlanPrice => price !== null),
      extras: prices.data
        .map(toRawExtraPrice)
        .filter((price): price is RawExtraPrice => price !== null),
    }
  },
}

/**
 * Em `ENV=test` o default não fala com o Stripe: sem este desvio, todo teste de
 * controller que passasse por teto de plano faria chamada de rede e o resultado
 * mudaria conforme o que estivesse configurado na conta naquele dia.
 *
 * O catálogo é fixo, com os mesmos códigos e a mesma forma do real (teto
 * crescente, excedente só nos planos grandes) — quem afere valor ou regra de
 * catálogo injeta a porta (`fakePlansPort`, em `src/tests/helpers/plans.ts`).
 */
const OFFLINE_PLANS: Array<{
  code: PlanCode
  maxMembers: number
  rank: number
  extra: boolean
  monthlyCents: number
}> = [
  { code: 'solo', maxMembers: 1, rank: 1, extra: false, monthlyCents: 9_700 },
  { code: 'banca', maxMembers: 5, rank: 2, extra: false, monthlyCents: 19_700 },
  {
    code: 'escritorio',
    maxMembers: 15,
    rank: 3,
    extra: true,
    monthlyCents: 34_700,
  },
  { code: 'max', maxMembers: 40, rank: 4, extra: true, monthlyCents: 59_700 },
]

const offlinePlansPort: PlansPort = {
  async readPlanPrices() {
    return {
      plans: OFFLINE_PLANS.flatMap((plan) =>
        PLAN_INTERVALS.map((interval) => ({
          priceId: `price_offline_${plan.code}_${interval}`,
          amountCents:
            interval === 'yearly' ? plan.monthlyCents * 9 : plan.monthlyCents,
          currency: 'brl',
          code: plan.code,
          interval,
          name: `Jurispro ${plan.code}`,
          maxMembers: plan.maxMembers,
          rank: plan.rank,
          allowsExtraMembers: plan.extra,
        })),
      ),
      extras: PLAN_INTERVALS.map((interval) => ({
        priceId: `price_offline_extra_${interval}`,
        amountCents: interval === 'yearly' ? 35_100 : 3_900,
        currency: 'brl',
        interval,
      })),
    }
  },
}

export const stripePlansPort: PlansPort =
  env.ENV === 'test' ? offlinePlansPort : realPlansPort

const CACHE_TTL_MS = 10 * MS_PER_MINUTE

let cache: { catalog: Catalog; at: number } | null = null

/** Só para teste: a página pública é cacheada, e o teste não pode herdar isso. */
export function clearPlansCache(): void {
  cache = null
}

/**
 * A landing é pública e pode receber tráfego de campanha; preço muda de mês em
 * mês, não de segundo em segundo. Dez minutos de cache em memória evitam
 * transformar cada visita numa chamada ao Stripe.
 */
export async function loadCatalog(
  port: PlansPort = stripePlansPort,
  now: number = Date.now(),
): Promise<Catalog> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.catalog

  const byCode = new Map<PlanCode, Plan>()
  const { plans: rawPlans, extras } = await port.readPlanPrices()

  for (const price of rawPlans) {
    const plan = byCode.get(price.code) ?? {
      code: price.code,
      name: price.name,
      maxMembers: price.maxMembers,
      rank: price.rank,
      currency: price.currency,
      allowsExtraMembers: price.allowsExtraMembers,
      monthly: null,
      yearly: null,
    }

    plan[price.interval] = {
      priceId: price.priceId,
      amountCents: price.amountCents,
    }

    byCode.set(price.code, plan)
  }

  // Plano sem nenhum preço legível não existe para a tela; um plano fora do ar
  // não deve derrubar a página dos outros.
  const plans = [...byCode.values()]
    .filter((plan) => plan.monthly !== null || plan.yearly !== null)
    .sort((a, b) => a.rank - b.rank)

  const extraMember: ExtraMemberPrices = { monthly: null, yearly: null }

  for (const extra of extras) {
    extraMember[extra.interval] = {
      priceId: extra.priceId,
      amountCents: extra.amountCents,
    }
  }

  const catalog: Catalog = { plans, extraMember }

  cache = { catalog, at: now }

  return catalog
}

/** Os planos publicados, do menor para o maior. */
export async function listPlans(
  port?: PlansPort,
  now?: number,
): Promise<Plan[]> {
  return (await loadCatalog(port, now)).plans
}

/**
 * Preço do advogado adicional. `null` quando o excedente não está configurado —
 * e aí nenhum plano deixa passar do teto, por mais que o produto diga que sim.
 */
export async function extraMemberPrice(
  interval: PlanInterval,
  port?: PlansPort,
  now?: number,
): Promise<PlanPrice | null> {
  return (await loadCatalog(port, now)).extraMember[interval]
}

/** O plano de um preço já contratado — é assim que a assinatura vira plano. */
export async function planByPriceId(
  priceId: string,
  port?: PlansPort,
  now?: number,
): Promise<{ plan: Plan; interval: PlanInterval } | null> {
  for (const plan of await listPlans(port, now)) {
    if (plan.monthly?.priceId === priceId) return { plan, interval: 'monthly' }
    if (plan.yearly?.priceId === priceId) return { plan, interval: 'yearly' }
  }

  return null
}

export async function planByCode(
  code: PlanCode,
  port?: PlansPort,
  now?: number,
): Promise<Plan | null> {
  const plans = await listPlans(port, now)

  return plans.find((plan) => plan.code === code) ?? null
}

/** O menor plano que comporta `members` pessoas — o alvo do upgrade. */
export async function smallestPlanFor(
  members: number,
  port?: PlansPort,
  now?: number,
): Promise<Plan | null> {
  const plans = await listPlans(port, now)

  return plans.find((plan) => plan.maxMembers >= members) ?? null
}
