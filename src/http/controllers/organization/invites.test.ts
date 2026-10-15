import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { hashInviteToken } from '@/services/tenant/invite-token'
import {
  cleanDatabase,
  createMember,
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

function tokenFromUrl(inviteUrl: string) {
  return inviteUrl.split('/').at(-1) as string
}

describe('POST /organizations/:organizationId/invites', () => {
  it('owner cria convite e o banco guarda só o hash', async () => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
      payload: { email: 'novo@example.com', role: 'lawyer' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().data).toMatchObject({
      email: 'novo@example.com',
      role: 'lawyer',
    })

    const rawToken = tokenFromUrl(res.json().data.inviteUrl)

    const invite = await systemPrisma.invite.findUniqueOrThrow({
      where: { id: res.json().data.id },
      select: { tokenHash: true, invitedById: true, status: true },
    })

    expect(invite.tokenHash).toBe(hashInviteToken(rawToken))
    expect(invite.tokenHash).not.toContain(rawToken)
    expect(invite.invitedById).toBe(org.owner.id)
    expect(invite.status).toBe('pending')
  })

  it('admin cria convite', async () => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers: {
        authorization: `Bearer ${tokenFor(org.admin.id, org.organization.id)}`,
      },
      payload: { email: 'outro@example.com', role: 'staff' },
    })

    expect(res.statusCode).toBe(201)
  })

  it.each(['lawyer', 'staff', 'intern'] as const)('nega %s', async (role) => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers: {
        authorization: `Bearer ${tokenFor(org[role].id, org.organization.id)}`,
      },
      payload: { email: 'nao@example.com', role: 'lawyer' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('recusa convite para titular', async () => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
      payload: { email: 'novo@example.com', role: 'owner' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('recusa e-mail que já é membro ativo', async () => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
      payload: { email: org.lawyer.mail, role: 'staff' },
    })

    expect(res.statusCode).toBe(409)
  })

  it('recusa segundo convite pendente para o mesmo e-mail, ignorando caixa', async () => {
    const org = await createOrganizationWithRoles()
    const headers = {
      authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
    }

    const first = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers,
      payload: { email: 'Novo@Example.com', role: 'lawyer' },
    })

    expect(first.statusCode).toBe(201)
    expect(first.json().data.email).toBe('novo@example.com')

    const second = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers,
      payload: { email: 'novo@example.com', role: 'staff' },
    })

    expect(second.statusCode).toBe(409)
  })

  it('devolve 404 para organização diferente da do token', async () => {
    const org = await createOrganizationWithRoles()
    const other = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${other.organization.id}/invites`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
      payload: { email: 'novo@example.com', role: 'lawyer' },
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('GET /organizations/:organizationId/invites', () => {
  it('lista só os pendentes da própria organização', async () => {
    const org = await createOrganizationWithRoles()
    const headers = {
      authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
    }

    await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers,
      payload: { email: 'pendente@example.com', role: 'lawyer' },
    })

    const revoked = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers,
      payload: { email: 'revogado@example.com', role: 'lawyer' },
    })

    await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/invites/${revoked.json().data.id}`,
      headers,
    })

    // Convite de outro escritório, para provar o filtro de organização —
    // `Invite` é non-tenant, ninguém filtra por baixo.
    const otherOrg = await createTestUser()
    await systemPrisma.invite.create({
      data: {
        organizationId: otherOrg.organization.id,
        email: 'alheio@example.com',
        role: 'lawyer',
        tokenHash: hashInviteToken('token-alheio'),
        invitedById: otherOrg.user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/organizations/${org.organization.id}/invites`,
      headers,
    })

    expect(res.statusCode).toBe(200)

    const emails = (res.json().data as Array<{ email: string }>).map(
      (i) => i.email,
    )

    expect(emails).toEqual(['pendente@example.com'])
  })

  it('nega staff', async () => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'GET',
      url: `/organizations/${org.organization.id}/invites`,
      headers: {
        authorization: `Bearer ${tokenFor(org.staff.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('DELETE /organizations/:organizationId/invites/:inviteId', () => {
  it('revoga convite pendente', async () => {
    const org = await createOrganizationWithRoles()
    const headers = {
      authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
    }

    const created = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/invites`,
      headers,
      payload: { email: 'revogar@example.com', role: 'lawyer' },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/invites/${created.json().data.id}`,
      headers,
    })

    expect(res.statusCode).toBe(204)

    const invite = await systemPrisma.invite.findUniqueOrThrow({
      where: { id: created.json().data.id },
      select: { status: true },
    })

    expect(invite.status).toBe('revoked')
  })

  it('devolve 404 para convite de outra organização', async () => {
    const org = await createOrganizationWithRoles()
    const otherOwner = await createTestUser()
    await createMember(otherOwner.organization.id, 'admin')

    const alien = await systemPrisma.invite.create({
      data: {
        organizationId: otherOwner.organization.id,
        email: 'alheio2@example.com',
        role: 'lawyer',
        tokenHash: hashInviteToken('token-alheio-2'),
        invitedById: otherOwner.user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/invites/${alien.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(404)

    const untouched = await systemPrisma.invite.findUniqueOrThrow({
      where: { id: alien.id },
      select: { status: true },
    })

    expect(untouched.status).toBe('pending')
  })
})
