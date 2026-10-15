import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase } from '@/tests/helpers/db'

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

async function organizationForUser(userId: string) {
  const membership = await systemPrisma.membership.findFirst({
    where: { userId },
    include: { organization: true },
  })
  return membership?.organization
}

describe('POST /users', () => {
  it('creates the organization from officeName and phone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        name: 'Fulano de Tal',
        mail: 'fulano@example.com',
        document: '12345678901',
        oabNumber: 'SP/123456',
        password: 'password123',
        officeName: 'Fulano Advocacia',
        phone: '11987654321',
      },
    })

    expect(response.statusCode).toBe(201)
    const { id } = response.json()

    const organization = await organizationForUser(id)

    expect(organization?.name).toBe('Fulano Advocacia')
    expect(organization?.phone).toBe('11987654321')
  })

  it('falls back to a personal-wallet name and null phone without officeName/phone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        name: 'Ciclana Souza',
        mail: 'ciclana@example.com',
        document: '10987654321',
        oabNumber: 'SP/654321',
        password: 'password123',
      },
    })

    expect(response.statusCode).toBe(201)
    const { id } = response.json()

    const organization = await organizationForUser(id)

    expect(organization?.name).toBe('Carteira de Ciclana Souza')
    expect(organization?.phone).toBeNull()
  })
})
