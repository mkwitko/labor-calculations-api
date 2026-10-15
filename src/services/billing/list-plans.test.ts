import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import {
  clearPlansCache,
  listPlans,
  lookupKey,
  PLAN_LOOKUP_KEYS,
  type PlansPort,
  planByPriceId,
  type RawExtraPrice,
  type RawPlanPrice,
  smallestPlanFor,
  toRawPlanPrice,
} from '@/services/billing/list-plans'
import { MS_PER_MINUTE } from '@/utils/constants'

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  clearPlansCache()
})

function price(
  code: RawPlanPrice['code'],
  interval: RawPlanPrice['interval'],
  amountCents: number,
  maxMembers: number,
  rank: number,
  allowsExtraMembers = false,
): RawPlanPrice {
  return {
    priceId: `price_${code}_${interval}`,
    amountCents,
    currency: 'brl',
    code,
    interval,
    name: `Jurispro ${code}`,
    maxMembers,
    rank,
    allowsExtraMembers,
  }
}

const SOLO_MONTHLY = price('solo', 'monthly', 9700, 1, 1)
const SOLO_YEARLY = price('solo', 'yearly', 87300, 1, 1)
const BANCA_MONTHLY = price('banca', 'monthly', 19700, 5, 2)

function fakePort(prices: RawPlanPrice[], extras: RawExtraPrice[] = []) {
  let calls = 0

  const port: PlansPort = {
    async readPlanPrices() {
      calls += 1

      return { plans: prices, extras }
    },
  }

  return { port, calls: () => calls }
}

describe('listPlans', () => {
  it('junta os dois intervalos do mesmo plano num único item', async () => {
    const { port } = fakePort([SOLO_MONTHLY, SOLO_YEARLY])

    const plans = await listPlans(port, 1_000)

    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      code: 'solo',
      maxMembers: 1,
      monthly: { priceId: 'price_solo_monthly', amountCents: 9700 },
      yearly: { priceId: 'price_solo_yearly', amountCents: 87300 },
    })
  })

  it('ordena do menor plano para o maior, e não pela ordem do Stripe', async () => {
    const { port } = fakePort([BANCA_MONTHLY, SOLO_MONTHLY])

    const plans = await listPlans(port, 1_000)

    expect(plans.map((plan) => plan.code)).toEqual(['solo', 'banca'])
  })

  it('mantém o plano que só tem um dos intervalos', async () => {
    const { port } = fakePort([BANCA_MONTHLY])

    const plans = await listPlans(port, 1_000)

    expect(plans[0].monthly).not.toBeNull()
    expect(plans[0].yearly).toBeNull()
  })

  it('cacheia por dez minutos e relê depois disso', async () => {
    const base = 1_700_000_000_000
    const { port, calls } = fakePort([SOLO_MONTHLY])

    await listPlans(port, base)
    expect(calls()).toBe(1)

    await listPlans(port, base + 5 * MS_PER_MINUTE)
    expect(calls()).toBe(1)

    await listPlans(port, base + 11 * MS_PER_MINUTE)
    expect(calls()).toBe(2)
  })
})

describe('planByPriceId', () => {
  it('reconhece o intervalo do preço contratado', async () => {
    const { port } = fakePort([SOLO_MONTHLY, SOLO_YEARLY])

    const found = await planByPriceId('price_solo_yearly', port, 1_000)

    expect(found?.interval).toBe('yearly')
    expect(found?.plan.code).toBe('solo')
  })

  it('devolve null para preço que não é de plano', async () => {
    const { port } = fakePort([SOLO_MONTHLY])

    expect(await planByPriceId('price_api_uso', port, 1_000)).toBeNull()
  })
})

describe('smallestPlanFor', () => {
  it('escolhe o menor plano que comporta o time', async () => {
    const { port } = fakePort([SOLO_MONTHLY, BANCA_MONTHLY])

    expect((await smallestPlanFor(1, port, 1_000))?.code).toBe('solo')
    expect((await smallestPlanFor(2, port, 1_000))?.code).toBe('banca')
  })

  it('devolve null quando nem o maior plano comporta', async () => {
    const { port } = fakePort([SOLO_MONTHLY, BANCA_MONTHLY])

    expect(await smallestPlanFor(99, port, 1_000)).toBeNull()
  })
})

describe('toRawPlanPrice', () => {
  const product = {
    id: 'prod_x',
    object: 'product',
    name: 'Jurispro Banca',
    metadata: { code: 'banca', max_members: '5', rank: '2' },
  }

  function stripePrice(overrides: Record<string, unknown> = {}) {
    return {
      id: 'price_x',
      active: true,
      currency: 'brl',
      unit_amount: 19700,
      metadata: { plan_interval: 'monthly' },
      product,
      ...overrides,
      // biome-ignore lint/suspicious/noExplicitAny: fixture parcial do Stripe
    } as any
  }

  it('lê teto e nome do produto, não do preço', () => {
    expect(toRawPlanPrice(stripePrice())).toMatchObject({
      code: 'banca',
      maxMembers: 5,
      name: 'Jurispro Banca',
    })
  })

  it('descarta preço sem teto legível em vez de criar plano de teto zero', () => {
    const semTeto = stripePrice({
      product: { ...product, metadata: { code: 'banca', rank: '2' } },
    })

    // Um plano com teto 0 impediria a organização de convidar qualquer pessoa.
    expect(toRawPlanPrice(semTeto)).toBeNull()
  })

  it('descarta preço de produto que não é plano', () => {
    const outro = stripePrice({
      product: { ...product, metadata: { code: 'api', max_members: '1' } },
    })

    expect(toRawPlanPrice(outro)).toBeNull()
  })

  it('descarta preço arquivado', () => {
    expect(toRawPlanPrice(stripePrice({ active: false }))).toBeNull()
  })
})

describe('lookup keys', () => {
  it('cobre os quatro planos nos dois intervalos, mais o excedente', () => {
    expect(PLAN_LOOKUP_KEYS).toHaveLength(10)
    expect(PLAN_LOOKUP_KEYS).toContain(lookupKey('escritorio', 'yearly'))
    expect(PLAN_LOOKUP_KEYS).toContain('plan_extra_member_monthly')
  })
})

/**
 * A rota usa a porta default, que em `ENV=test` é o catálogo offline — nada de
 * rede, e resultado que não muda conforme o que está configurado na conta hoje.
 * O que se afere é o contrato: nunca 401, e 503 em vez de lista vazia quando o
 * plano não é legível.
 */
describe('GET /billing/plans', () => {
  it('não exige autenticação', async () => {
    const res = await app.inject({ method: 'GET', url: '/billing/plans' })

    expect(res.statusCode).not.toBe(401)
  })

  it('devolve 200 com planos ou 503, nunca lista vazia', async () => {
    const res = await app.inject({ method: 'GET', url: '/billing/plans' })

    expect([200, 503]).toContain(res.statusCode)

    if (res.statusCode !== 200) return

    const plans = res.json().data as Array<{
      code: string
      maxMembers: number
      monthly: { amountCents: number } | null
      yearly: { amountCents: number } | null
    }>

    expect(plans.length).toBeGreaterThan(0)

    for (const plan of plans) {
      expect(plan.maxMembers).toBeGreaterThan(0)
      expect(plan.monthly ?? plan.yearly).not.toBeNull()
    }

    // Ordem comercial: a landing desenha os cards nela.
    const caps = plans.map((plan) => plan.maxMembers)
    expect([...caps].sort((a, b) => a - b)).toEqual(caps)
  })
})
