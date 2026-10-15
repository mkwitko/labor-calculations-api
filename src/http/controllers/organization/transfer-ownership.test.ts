import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
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

async function roleOf(userId: string, organizationId: string) {
  const membership = await systemPrisma.membership.findFirstOrThrow({
    where: { userId, organizationId, deletedAt: null },
    select: { role: true },
  })

  return membership.role
}

describe('POST /organizations/:organizationId/transfer-ownership', () => {
  it('titular passa a titularidade e vira admin', async () => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/transfer-ownership`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
      payload: { userId: org.admin.id },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      ownerUserId: org.admin.id,
      previousOwnerRole: 'admin',
    })

    expect(await roleOf(org.admin.id, org.organization.id)).toBe('owner')
    expect(await roleOf(org.owner.id, org.organization.id)).toBe('admin')
  })

  it('depois de transferir, o antigo titular consegue sair', async () => {
    const org = await createOrganizationWithRoles()
    const headers = {
      authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
    }

    const blocked = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/members/me`,
      headers,
    })

    expect(blocked.statusCode).toBe(409)

    await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/transfer-ownership`,
      headers,
      payload: { userId: org.admin.id },
    })

    const left = await app.inject({
      method: 'DELETE',
      url: `/organizations/${org.organization.id}/members/me`,
      headers,
    })

    expect(left.statusCode).toBe(204)
  })

  it('o antigo titular não transfere de novo', async () => {
    const org = await createOrganizationWithRoles()
    const headers = {
      authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
    }

    await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/transfer-ownership`,
      headers,
      payload: { userId: org.admin.id },
    })

    const again = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/transfer-ownership`,
      headers,
      payload: { userId: org.lawyer.id },
    })

    expect(again.statusCode).toBe(403)
  })

  it('nega admin', async () => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/transfer-ownership`,
      headers: {
        authorization: `Bearer ${tokenFor(org.admin.id, org.organization.id)}`,
      },
      payload: { userId: org.lawyer.id },
    })

    expect(res.statusCode).toBe(403)
  })

  it('devolve 404 para quem não é membro ativo', async () => {
    const org = await createOrganizationWithRoles()
    const stranger = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/transfer-ownership`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
      payload: { userId: stranger.user.id },
    })

    expect(res.statusCode).toBe(404)
  })

  it('devolve 400 ao transferir para si mesmo', async () => {
    const org = await createOrganizationWithRoles()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${org.organization.id}/transfer-ownership`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
      payload: { userId: org.owner.id },
    })

    expect(res.statusCode).toBe(400)
  })

  it('devolve 404 para organização diferente da do token', async () => {
    const org = await createOrganizationWithRoles()
    const other = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: `/organizations/${other.organization.id}/transfer-ownership`,
      headers: {
        authorization: `Bearer ${tokenFor(org.owner.id, org.organization.id)}`,
      },
      payload: { userId: org.admin.id },
    })

    expect(res.statusCode).toBe(404)
  })
})
