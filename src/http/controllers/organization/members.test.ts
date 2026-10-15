import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createMember, createTestUser } from '@/tests/helpers/db'

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

/**
 * Fixture com os cinco papéis **e as membership ids** — diferente de
 * `createOrganizationWithRoles`, que devolve só os usuários. Mudar papel e
 * remover membro operam sobre a membership, não sobre a pessoa.
 */
async function organizationWithMemberships() {
  const { user: owner, organization } = await createTestUser()

  const ownerMembership = await systemPrisma.membership.findFirstOrThrow({
    where: { userId: owner.id, organizationId: organization.id },
    select: { id: true },
  })

  const admin = await createMember(organization.id, 'admin')
  const lawyer = await createMember(organization.id, 'lawyer')
  const staff = await createMember(organization.id, 'staff')
  const intern = await createMember(organization.id, 'intern')

  return {
    organization,
    owner: { user: owner, membership: ownerMembership },
    admin,
    lawyer,
    staff,
    intern,
  }
}

function tokenFor(userId: string, organizationId: string) {
  return app.jwt.sign({ sub: userId, org: organizationId })
}

describe('GET /organizations/:organizationId/members', () => {
  it('owner lista os cinco membros', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'GET',
      url: `/organizations/${org.organization.id}/members`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.user.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toHaveLength(5)
    expect(res.json().data[0]).toMatchObject({ role: 'owner' })
  })

  it('nega lawyer', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'GET',
      url: `/organizations/${org.organization.id}/members`,
      headers: {
        authorization: `Bearer ${tokenFor(org.lawyer.user.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(403)
  })

  it('devolve 404 para organização diferente da do token', async () => {
    const org = await organizationWithMemberships()
    const other = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: `/organizations/${other.organization.id}/members`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.user.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /organizations/:organizationId/members/:membershipId', () => {
  it('owner promove lawyer a staff e o papel novo vale no request seguinte', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'PATCH',
      url: `/organizations/${org.organization.id}/members/${org.lawyer.membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.user.id, org.organization.id)}`,
      },
      payload: { role: 'staff' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ role: 'staff' })

    // staff acessa o financeiro; lawyer não. O papel novo é lido a cada
    // request pelo hook de auth, sem esperar o access token expirar.
    const finance = await app.inject({
      method: 'GET',
      url: '/dashboard/finance',
      headers: {
        authorization: `Bearer ${tokenFor(org.lawyer.user.id, org.organization.id)}`,
      },
    })

    expect(finance.statusCode).toBe(200)
  })

  it('recusa papel owner pelo corpo', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'PATCH',
      url: `/organizations/${org.organization.id}/members/${org.admin.membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.user.id, org.organization.id)}`,
      },
      payload: { role: 'owner' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('nega mudar o próprio papel, mesmo sendo owner', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'PATCH',
      url: `/organizations/${org.organization.id}/members/${org.owner.membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.user.id, org.organization.id)}`,
      },
      payload: { role: 'admin' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('nega admin alterando a membership do owner', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'PATCH',
      url: `/organizations/${org.organization.id}/members/${org.owner.membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.admin.user.id, org.organization.id)}`,
      },
      payload: { role: 'admin' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('devolve 404 para membership de outra organização', async () => {
    const org = await organizationWithMemberships()
    const other = await createTestUser()
    const outsider = await createMember(other.organization.id, 'lawyer')

    const res = await app.inject({
      method: 'PATCH',
      url: `/organizations/${org.organization.id}/members/${outsider.membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.user.id, org.organization.id)}`,
      },
      payload: { role: 'staff' },
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /organizations/:organizationId/members/:membershipId', () => {
  it('owner remove intern e o acesso cai no request seguinte', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/members/${org.intern.membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.user.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(204)

    const after = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: {
        authorization: `Bearer ${tokenFor(org.intern.user.id, org.organization.id)}`,
      },
    })

    // 401, não 403: quem foi removido não perdeu um verbo, perdeu a sessão. É
    // esse status que faz o front deslogar em vez de deixar a pessoa presa
    // vendo o mesmo erro em cada tela.
    expect(after.statusCode).toBe(401)
  })

  it('nega remover o titular', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/members/${org.owner.membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.admin.user.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(403)
  })

  it('nega remover a própria membership e aponta a rota de saída', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/members/${org.admin.membership.id}`,
      headers: {
        authorization: `Bearer ${tokenFor(org.admin.user.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().message).toMatch(/members\/me/)
  })
})

describe('DELETE /organizations/:organizationId/members/me', () => {
  it('lawyer sai da organização', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/members/me`,
      headers: {
        authorization: `Bearer ${tokenFor(org.lawyer.user.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(204)

    const membership = await systemPrisma.membership.findUniqueOrThrow({
      where: { id: org.lawyer.membership.id },
      select: { deletedAt: true },
    })

    expect(membership.deletedAt).not.toBeNull()
  })

  it('owner não sai sem transferir a titularidade', async () => {
    const org = await organizationWithMemberships()

    const res = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/members/me`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.user.id, org.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toMatch(/titularidade/i)
  })
})
