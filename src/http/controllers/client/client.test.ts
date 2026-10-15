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

function authToken(userId: string): string {
  return app.jwt.sign({ sub: userId })
}

async function twoUsers() {
  const { user: userA, organization: organizationA } = await createTestUser({
    mail: 'a@test.com',
    oabNumber: 'SP/1',
    document: '111',
  })
  const { user: userB, organization: organizationB } = await createTestUser({
    mail: 'b@test.com',
    oabNumber: 'SP/2',
    document: '222',
  })
  return { userA, userB, organizationA, organizationB }
}

describe('POST /clients', () => {
  function postClient(userId: string, payload: Record<string, string>) {
    return app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${authToken(userId)}` },
      payload,
    })
  }

  it('recusa e-mail repetido no mesmo escritório', async () => {
    const { user } = await createTestUser()

    await postClient(user.id, {
      name: 'Primeiro',
      mail: 'cliente@example.com',
    })

    const res = await postClient(user.id, {
      name: 'Segundo',
      mail: 'cliente@example.com',
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBe(
      'Já existe um cliente com esse e-mail neste escritório',
    )
  })

  it('aceita o mesmo e-mail em escritórios diferentes', async () => {
    const { userA, userB } = await twoUsers()

    await postClient(userA.id, {
      name: 'Primeiro',
      mail: 'cliente@example.com',
    })

    const res = await postClient(userB.id, {
      name: 'Outro escritório',
      mail: 'cliente@example.com',
    })

    expect(res.statusCode).toBe(201)
  })

  it('creates a client and returns its id', async () => {
    const { user } = await createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { name: 'Maria Silva', document: '52998224725' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().id).toEqual(expect.any(String))
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/clients',
      payload: { name: 'Maria' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when name is too short', async () => {
    const { user } = await createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { name: 'M' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a duplicate document for the same user (409)', async () => {
    const { user } = await createTestUser()
    const headers = { authorization: `Bearer ${authToken(user.id)}` }
    const payload = { name: 'Maria Silva', document: '52998224725' }

    const first = await app.inject({
      method: 'POST',
      url: '/clients',
      headers,
      payload,
    })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({
      method: 'POST',
      url: '/clients',
      headers,
      payload,
    })
    expect(second.statusCode).toBe(409)
  })

  it('allows the same document for different users', async () => {
    const { userA, userB } = await twoUsers()
    const payload = { name: 'Maria Silva', document: '52998224725' }

    const resA = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${authToken(userA.id)}` },
      payload,
    })
    const resB = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${authToken(userB.id)}` },
      payload,
    })

    expect(resA.statusCode).toBe(201)
    expect(resB.statusCode).toBe(201)
  })
})

describe('GET /clients', () => {
  it('lists only the requesting user clients', async () => {
    const { userA, userB, organizationA, organizationB } = await twoUsers()
    await systemPrisma.client.create({
      data: {
        userId: userA.id,
        name: 'Cliente A',
        organizationId: organizationA.id,
      },
    })
    await systemPrisma.client.create({
      data: {
        userId: userB.id,
        name: 'Cliente B',
        organizationId: organizationB.id,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/clients',
      headers: { authorization: `Bearer ${authToken(userA.id)}` },
    })

    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Cliente A')
  })

  it('omits soft-deleted clients', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.client.create({
      data: { userId: user.id, name: 'Ativo', organizationId: organization.id },
    })
    await systemPrisma.client.create({
      data: {
        userId: user.id,
        name: 'Removido',
        deletedAt: new Date(),
        organizationId: organization.id,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/clients',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    const { data } = res.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Ativo')
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/clients' })
    expect(res.statusCode).toBe(401)
  })
})

describe('DELETE /clients/:clientId', () => {
  it('soft-deletes and hides the client afterwards', async () => {
    const { user, organization } = await createTestUser()
    const client = await systemPrisma.client.create({
      data: {
        userId: user.id,
        name: 'Para remover',
        organizationId: organization.id,
      },
    })

    const del = await app.inject({
      method: 'DELETE',
      url: `/clients/${client.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(del.statusCode).toBe(204)

    const row = await systemPrisma.client.findUnique({
      where: { id: client.id },
    })
    expect(row?.deletedAt).toBeInstanceOf(Date)

    const get = await app.inject({
      method: 'GET',
      url: `/clients/${client.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(get.statusCode).toBe(404)
  })

  it("cannot delete another user's client (404)", async () => {
    const { userA, userB, organizationA } = await twoUsers()
    const client = await systemPrisma.client.create({
      data: {
        userId: userA.id,
        name: 'De A',
        organizationId: organizationA.id,
      },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/clients/${client.id}`,
      headers: { authorization: `Bearer ${authToken(userB.id)}` },
    })
    expect(res.statusCode).toBe(404)

    const row = await systemPrisma.client.findUnique({
      where: { id: client.id },
    })
    expect(row?.deletedAt).toBeNull()
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/clients/whatever' })
    expect(res.statusCode).toBe(401)
  })
})

describe('clientes são da organização, não da pessoa', () => {
  function token(userId: string, organizationId: string): string {
    return app.jwt.sign({ sub: userId, org: organizationId })
  }

  it('associado enxerga cliente cadastrado pelo owner', async () => {
    const roles = await createOrganizationWithRoles()
    const client = await systemPrisma.client.create({
      data: {
        name: 'Cliente do escritório',
        userId: roles.owner.id,
        organizationId: roles.organization.id,
      },
      select: { id: true },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/clients/${client.id}`,
      headers: {
        authorization: `Bearer ${token(roles.lawyer.id, roles.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('intern recebe 403 ao cadastrar cliente', async () => {
    const roles = await createOrganizationWithRoles()
    const res = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: {
        authorization: `Bearer ${token(roles.intern.id, roles.organization.id)}`,
      },
      payload: { name: 'Cliente novo' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('duplicidade de documento é checada na organização inteira', async () => {
    const roles = await createOrganizationWithRoles()
    await systemPrisma.client.create({
      data: {
        name: 'Primeiro',
        document: '12345678900',
        userId: roles.owner.id,
        organizationId: roles.organization.id,
      },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: {
        authorization: `Bearer ${token(roles.lawyer.id, roles.organization.id)}`,
      },
      payload: { name: 'Segundo', document: '12345678900' },
    })

    expect(res.statusCode).toBe(409)
  })
})
