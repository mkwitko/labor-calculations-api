import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { hashInviteToken } from '@/services/tenant/invite-token'
import {
  cleanDatabase,
  createOrganizationWithRoles,
  createTestUser,
} from '@/tests/helpers/db'

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

function tokenFor(userId: string, organizationId: string) {
  return app.jwt.sign({ sub: userId, org: organizationId })
}

/**
 * Convite emitido pelo escritório para uma pessoa que já tem conta própria —
 * o caso do advogado com carteira que passa a ocupar um assento.
 */
async function inviteToOffice(
  overrides: { role?: 'admin' | 'lawyer' | 'staff' | 'intern' } = {},
) {
  const office = await createOrganizationWithRoles()
  const outsider = await createTestUser()

  const created = await app.inject({
    method: 'POST',
    url: `/organizations/${office.organization.id}/invites`,
    headers: {
      authorization: `Bearer ${tokenFor(office.owner.id, office.organization.id)}`,
    },
    payload: { email: outsider.user.mail, role: overrides.role ?? 'lawyer' },
  })

  const rawToken = (created.json().data.inviteUrl as string).split('/').at(-1)

  return {
    office,
    outsider,
    inviteId: created.json().data.id as string,
    rawToken: rawToken as string,
  }
}

describe('GET /invites/:token', () => {
  it('devolve os dados do convite sem autenticação', async () => {
    const { office, outsider, rawToken } = await inviteToOffice()

    const res = await app.inject({ method: 'GET', url: `/invites/${rawToken}` })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      organizationName: office.organization.name,
      email: outsider.user.mail.toLowerCase(),
      role: 'lawyer',
    })
  })

  it('devolve 404 para token desconhecido', async () => {
    const res = await app.inject({ method: 'GET', url: '/invites/nao-existe' })

    expect(res.statusCode).toBe(404)
  })

  it('devolve 409 para convite revogado', async () => {
    const { office, inviteId, rawToken } = await inviteToOffice()

    await app.inject({
      method: 'DELETE',
      url: `/organizations/${office.organization.id}/invites/${inviteId}`,
      headers: {
        authorization: `Bearer ${tokenFor(office.owner.id, office.organization.id)}`,
      },
    })

    const res = await app.inject({ method: 'GET', url: `/invites/${rawToken}` })

    expect(res.statusCode).toBe(409)
  })

  it('marca como expirado e devolve 409 quando o prazo passou', async () => {
    const { inviteId, rawToken } = await inviteToOffice()

    await systemPrisma.invite.update({
      where: { id: inviteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await app.inject({ method: 'GET', url: `/invites/${rawToken}` })

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toMatch(/expirado/i)

    const invite = await systemPrisma.invite.findUniqueOrThrow({
      where: { id: inviteId },
      select: { status: true },
    })

    expect(invite.status).toBe('expired')
  })
})

describe('POST /invites/accept', () => {
  it('cria a membership com o papel do convite', async () => {
    const { office, outsider, inviteId, rawToken } = await inviteToOffice({
      role: 'staff',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: {
        authorization: `Bearer ${tokenFor(outsider.user.id, outsider.organization.id)}`,
      },
      payload: { token: rawToken },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().data).toMatchObject({
      organizationId: office.organization.id,
      role: 'staff',
    })

    const membership = await systemPrisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: outsider.user.id,
          organizationId: office.organization.id,
        },
      },
      select: { role: true, deletedAt: true },
    })

    expect(membership).toMatchObject({ role: 'staff', deletedAt: null })

    const invite = await systemPrisma.invite.findUniqueOrThrow({
      where: { id: inviteId },
      select: { status: true, acceptedAt: true },
    })

    expect(invite.status).toBe('accepted')
    expect(invite.acceptedAt).not.toBeNull()
  })

  it('o papel do convite vale depois de trocar de organização', async () => {
    const { office, outsider, rawToken } = await inviteToOffice({
      role: 'staff',
    })

    await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: {
        authorization: `Bearer ${tokenFor(outsider.user.id, outsider.organization.id)}`,
      },
      payload: { token: rawToken },
    })

    const switched = await app.inject({
      method: 'POST',
      url: '/auth/switch-organization',
      headers: {
        authorization: `Bearer ${tokenFor(outsider.user.id, outsider.organization.id)}`,
      },
      payload: { organizationId: office.organization.id },
    })

    expect(switched.statusCode).toBe(201)
    expect(switched.json().role).toBe('staff')
  })

  it('nega conta com e-mail diferente do convite', async () => {
    const { rawToken } = await inviteToOffice()
    const intruder = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: {
        authorization: `Bearer ${tokenFor(intruder.user.id, intruder.organization.id)}`,
      },
      payload: { token: rawToken },
    })

    expect(res.statusCode).toBe(403)
  })

  it('devolve 409 ao aceitar duas vezes', async () => {
    const { outsider, rawToken } = await inviteToOffice()
    const headers = {
      authorization: `Bearer ${tokenFor(outsider.user.id, outsider.organization.id)}`,
    }

    await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers,
      payload: { token: rawToken },
    })

    const second = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers,
      payload: { token: rawToken },
    })

    expect(second.statusCode).toBe(409)
  })

  it('reativa a membership de quem foi removido e reconvidado', async () => {
    const { office, outsider, rawToken } = await inviteToOffice({
      role: 'lawyer',
    })
    const headers = {
      authorization: `Bearer ${tokenFor(outsider.user.id, outsider.organization.id)}`,
    }

    await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers,
      payload: { token: rawToken },
    })

    const membership = await systemPrisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: outsider.user.id,
          organizationId: office.organization.id,
        },
      },
      select: { id: true },
    })

    await app.inject({
      method: 'DELETE',
      url: `/organizations/${office.organization.id}/members/${membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(office.owner.id, office.organization.id)}`,
      },
    })

    const reinvited = await app.inject({
      method: 'POST',
      url: `/organizations/${office.organization.id}/invites`,
      headers: {
        authorization: `Bearer ${tokenFor(office.owner.id, office.organization.id)}`,
      },
      payload: { email: outsider.user.mail, role: 'admin' },
    })

    const newToken = (reinvited.json().data.inviteUrl as string)
      .split('/')
      .at(-1) as string

    const accepted = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers,
      payload: { token: newToken },
    })

    expect(accepted.statusCode).toBe(201)

    const reactivated = await systemPrisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
      select: { role: true, deletedAt: true },
    })

    expect(reactivated).toMatchObject({ role: 'admin', deletedAt: null })
  })

  it('rebaixa indicação já qualificada entre quem convida e quem aceita', async () => {
    const { office, outsider, rawToken } = await inviteToOffice()

    // O titular do escritório indicou quem agora está entrando: sem o
    // rebaixamento, "indica primeiro, contrata depois" driblaria a regra.
    const referral = await systemPrisma.referral.create({
      data: {
        referrerId: office.owner.id,
        refereeId: outsider.user.id,
        status: 'qualified',
        qualifiedAt: new Date('2026-07-01'),
        firstPaidAmountCents: 9700,
      },
      select: { id: true },
    })

    const accepted = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: {
        authorization: `Bearer ${tokenFor(outsider.user.id, outsider.organization.id)}`,
      },
      payload: { token: rawToken },
    })

    expect(accepted.statusCode).toBe(201)

    const stored = await systemPrisma.referral.findUniqueOrThrow({
      where: { id: referral.id },
      select: { status: true, lostAt: true },
    })

    expect(stored.status).toBe('lost')
    expect(stored.lostAt).not.toBeNull()
  })

  it('não mexe em indicação de terceiro ao aceitar convite', async () => {
    const { outsider, rawToken } = await inviteToOffice()
    const unrelated = await createTestUser()

    const referral = await systemPrisma.referral.create({
      data: {
        referrerId: unrelated.user.id,
        refereeId: outsider.user.id,
        status: 'qualified',
        qualifiedAt: new Date('2026-07-01'),
        firstPaidAmountCents: 9700,
      },
      select: { id: true },
    })

    await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: {
        authorization: `Bearer ${tokenFor(outsider.user.id, outsider.organization.id)}`,
      },
      payload: { token: rawToken },
    })

    const stored = await systemPrisma.referral.findUniqueOrThrow({
      where: { id: referral.id },
      select: { status: true },
    })

    expect(stored.status).toBe('qualified')
  })

  it('devolve 409 para quem já é membro ativo', async () => {
    const office = await createOrganizationWithRoles()

    // Convite gravado direto: o endpoint de criação já barra membro ativo, e o
    // que se testa aqui é a segunda barreira, no aceite.
    const rawToken = 'token-para-membro-ativo'
    await systemPrisma.invite.create({
      data: {
        organizationId: office.organization.id,
        email: office.lawyer.mail.toLowerCase(),
        role: 'admin',
        tokenHash: hashInviteToken(rawToken),
        invitedById: office.owner.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: {
        authorization: `Bearer ${tokenFor(office.lawyer.id, office.organization.id)}`,
      },
      payload: { token: rawToken },
    })

    expect(res.statusCode).toBe(409)
  })
})
