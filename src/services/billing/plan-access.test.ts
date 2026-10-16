import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { clearPlansCache, type PlansPort } from '@/services/billing/list-plans'
import {
  assertCanAcceptInvite,
  assertCanAddMember,
  assertPlanFitsMembers,
  countOccupiedSeats,
  currentPlan,
  planOccupancy,
} from '@/services/billing/plan-access'
import { cleanDatabase, createMember, createTestUser } from '@/tests/helpers/db'
import { fakePlansPort, planPrices } from '@/tests/helpers/plans'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  clearPlansCache()
  await cleanDatabase()
})

const { port } = fakePlansPort()

async function organizationOn(code: string) {
  const { user, organization } = await createTestUser()

  await systemPrisma.organization.update({
    where: { id: organization.id },
    data: { planCode: code },
  })

  return { user, organization }
}

describe('currentPlan', () => {
  it('usa o plano guardado enquanto não há assinatura', async () => {
    const { organization } = await organizationOn('banca')

    const current = await currentPlan(organization.id, port)

    expect(current?.plan.code).toBe('banca')
    expect(current?.fromSubscription).toBe(false)
  })

  it('a assinatura ganha do plano guardado', async () => {
    const { organization } = await organizationOn('solo')

    await systemPrisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: `sub_${organization.id}`,
        stripeCustomerId: 'cus_x',
        status: 'active',
        priceId: 'price_escritorio_monthly',
      },
    })

    const current = await currentPlan(organization.id, port)

    // É o que o cliente paga. Liberar teto por uma coluna e cobrar por outra é
    // o pior dos dois mundos.
    expect(current?.plan.code).toBe('escritorio')
    expect(current?.fromSubscription).toBe(true)
  })

  it('cai no menor plano quando o guardado sumiu do Stripe', async () => {
    const { organization } = await organizationOn('plano_que_nao_existe')

    const current = await currentPlan(organization.id, port)

    expect(current?.plan.code).toBe('solo')
  })
})

describe('countOccupiedSeats', () => {
  it('soma membros ativos e convites pendentes', async () => {
    const { user, organization } = await organizationOn('banca')
    await createMember(organization.id, 'lawyer')

    await systemPrisma.invite.create({
      data: {
        organizationId: organization.id,
        email: 'convidado@example.com',
        role: 'lawyer',
        tokenHash: `hash_${organization.id}`,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })

    expect(await countOccupiedSeats(organization.id)).toEqual({
      members: 2,
      pendingInvites: 1,
      occupied: 3,
    })
  })

  it('ignora convite expirado, que não segura vaga nenhuma', async () => {
    const { user, organization } = await organizationOn('banca')

    await systemPrisma.invite.create({
      data: {
        organizationId: organization.id,
        email: 'velho@example.com',
        role: 'lawyer',
        tokenHash: `hash_velho_${organization.id}`,
        invitedById: user.id,
        expiresAt: new Date(Date.now() - 1_000),
      },
    })

    expect((await countOccupiedSeats(organization.id)).occupied).toBe(1)
  })
})

describe('assertCanAddMember', () => {
  it('deixa convidar enquanto sobra vaga', async () => {
    const { organization } = await organizationOn('banca')

    await expect(
      assertCanAddMember(organization.id, port),
    ).resolves.toBeUndefined()
  })

  it('barra com 409 quando o teto está cheio', async () => {
    const { organization } = await organizationOn('solo')

    // Plano Solo, e o titular já ocupa a única vaga.
    await expect(
      assertCanAddMember(organization.id, port),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('conta convite pendente como vaga ocupada', async () => {
    const { user, organization } = await organizationOn('banca')

    for (let i = 0; i < 4; i += 1) {
      await systemPrisma.invite.create({
        data: {
          organizationId: organization.id,
          email: `pendente${i}@example.com`,
          role: 'lawyer',
          tokenHash: `hash_${organization.id}_${i}`,
          invitedById: user.id,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      })
    }

    // 1 membro + 4 convites = 5, o teto do Banca. Sem contar convite, daria para
    // mandar dez e o estouro apareceria só no aceite.
    await expect(
      assertCanAddMember(organization.id, port),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('deixa passar do teto no plano que aceita advogado adicional', async () => {
    const { organization } = await organizationOn('escritorio')

    // Teto macio: o excedente entra como advogado adicional na fatura. Um
    // escritório não fica de fora do produto por ter crescido.
    await expect(
      assertCanAddMember(organization.id, port),
    ).resolves.toBeUndefined()
  })

  it('volta a barrar quando o excedente não tem preço configurado', async () => {
    const { organization } = await organizationOn('escritorio')
    const { port: semExtra } = fakePlansPort(
      [...planPrices('escritorio', 1, 3, true)],
      [],
    )

    // O produto promete excedente, mas sem preço ele sairia de graça.
    await expect(
      assertCanAddMember(organization.id, semExtra),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('sugere o menor plano que comporta mais uma pessoa', async () => {
    const { organization } = await organizationOn('solo')

    await expect(
      assertCanAddMember(organization.id, port),
    ).rejects.toThrowError(/banca/i)
  })

  it('deixa passar quando o Stripe não responde', async () => {
    const { organization } = await organizationOn('solo')

    const quebrado: PlansPort = {
      async readPlanPrices() {
        throw new Error('stripe fora')
      },
    }

    // Teto é regra comercial, não de segurança: o escritório não pode parar de
    // trabalhar porque o meio de pagamento está instável.
    await expect(
      assertCanAddMember(organization.id, quebrado),
    ).resolves.toBeUndefined()
  })
})

describe('assertCanAcceptInvite', () => {
  it('aceita o último convite que cabe, apesar de ele já contar como ocupado', async () => {
    const { user, organization } = await organizationOn('banca')
    await createMember(organization.id, 'lawyer')
    await createMember(organization.id, 'lawyer')
    await createMember(organization.id, 'lawyer')

    await systemPrisma.invite.create({
      data: {
        organizationId: organization.id,
        email: 'ultimo@example.com',
        role: 'lawyer',
        tokenHash: `hash_ultimo_${organization.id}`,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })

    // `occupied` já é 5 — 4 membros e o convite que está sendo aceito. Comparar
    // por `occupied` recusaria justamente o convite legítimo.
    await expect(
      assertCanAcceptInvite(organization.id, port),
    ).resolves.toBeUndefined()
  })

  it('barra quando o escritório encheu entre o envio e o clique', async () => {
    const { organization } = await organizationOn('solo')

    await expect(
      assertCanAcceptInvite(organization.id, port),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('deixa entrar quando ainda há lugar', async () => {
    const { organization } = await organizationOn('banca')

    await expect(
      assertCanAcceptInvite(organization.id, port),
    ).resolves.toBeUndefined()
  })
})

describe('assertPlanFitsMembers', () => {
  it('aceita a descida para plano com excedente, sem expulsar ninguém', async () => {
    const { organization } = await organizationOn('escritorio')
    await createMember(organization.id, 'lawyer')

    const escritorio = {
      code: 'escritorio' as const,
      name: 'LexLaboral escritorio',
      maxMembers: 1,
      rank: 3,
      currency: 'brl',
      allowsExtraMembers: true,
      monthly: { priceId: 'price_escritorio_monthly', amountCents: 34700 },
      yearly: null,
    }

    await expect(
      assertPlanFitsMembers(organization.id, escritorio),
    ).resolves.toBeUndefined()
  })

  it('recusa a descida que teria de expulsar gente', async () => {
    const { organization } = await organizationOn('banca')
    await createMember(organization.id, 'lawyer')

    const solo = {
      code: 'solo' as const,
      name: 'LexLaboral solo',
      maxMembers: 1,
      rank: 1,
      currency: 'brl',
      allowsExtraMembers: false,
      monthly: { priceId: 'price_solo_monthly', amountCents: 9700 },
      yearly: null,
    }

    await expect(
      assertPlanFitsMembers(organization.id, solo),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('planOccupancy', () => {
  it('conta as pessoas acima do teto como excedente', async () => {
    const { organization } = await organizationOn('escritorio')
    const { port: tetoDeUm } = fakePlansPort(
      planPrices('escritorio', 1, 3, true),
    )

    await createMember(organization.id, 'lawyer')
    await createMember(organization.id, 'lawyer')

    expect(await planOccupancy(organization.id, tetoDeUm)).toMatchObject({
      members: 3,
      maxMembers: 1,
      remaining: 0,
      allowsExtraMembers: true,
      extraMembers: 2,
    })
  })

  it('relata o que sobra do teto', async () => {
    const { organization } = await organizationOn('banca')
    await createMember(organization.id, 'lawyer')

    expect(await planOccupancy(organization.id, port)).toMatchObject({
      maxMembers: 5,
      members: 2,
      pendingInvites: 0,
      remaining: 3,
    })
  })
})
