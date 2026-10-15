import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

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

async function createAssociate(organizationId: string) {
  const associate = await systemPrisma.user.create({
    data: {
      name: 'Advogado Associado',
      mail: `associado_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
      document: `${Date.now()}${Math.random().toString(36).slice(2)}`,
      oabNumber: `SP/${Date.now()}${Math.random().toString(36).slice(2)}`,
      password: 'x',
    },
  })
  await systemPrisma.membership.create({
    data: { userId: associate.id, organizationId, role: 'lawyer' },
  })
  return associate
}

describe('PATCH /users/:id', () => {
  it('rejects a brand-field write from a lawyer-role member with 403', async () => {
    const { organization } = await createTestUser()
    const associate = await createAssociate(organization.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${associate.id}`,
      headers: { authorization: `Bearer ${authToken(associate.id)}` },
      payload: { officeName: 'Escritório Invadido' },
    })

    expect(res.statusCode).toBe(403)

    const org = await systemPrisma.organization.findUnique({
      where: { id: organization.id },
    })
    expect(org?.name).not.toBe('Escritório Invadido')
  })

  it('allows a bio-only update from a lawyer-role member (the gate only fires on brand fields)', async () => {
    const { organization } = await createTestUser()
    const associate = await createAssociate(organization.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${associate.id}`,
      headers: { authorization: `Bearer ${authToken(associate.id)}` },
      payload: { bio: 'Especialista em direito trabalhista' },
    })

    expect(res.statusCode).toBe(200)

    const updated = await systemPrisma.user.findUnique({
      where: { id: associate.id },
    })
    expect(updated?.bio).toBe('Especialista em direito trabalhista')
  })

  it("writes an owner's officeName to Organization.name, not to User", async () => {
    const { user, organization } = await createTestUser({ name: 'Ana Pereira' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${user.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { officeName: 'Pereira Advocacia' },
    })

    expect(res.statusCode).toBe(200)

    const org = await systemPrisma.organization.findUnique({
      where: { id: organization.id },
    })
    expect(org?.name).toBe('Pereira Advocacia')

    // A pessoa (User.name) não é tocada por um campo de marca — só o
    // escritório (Organization.name) muda.
    const owner = await systemPrisma.user.findUnique({
      where: { id: user.id },
    })
    expect(owner?.name).toBe('Ana Pereira')
  })
})
