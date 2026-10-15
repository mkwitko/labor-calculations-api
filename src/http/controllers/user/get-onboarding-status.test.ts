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

describe('GET /onboarding/status', () => {
  it('reports the office step incomplete while the organization has no logoUrl', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: '/onboarding/status',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().profileComplete).toBe(false)
  })

  it('reports the office step complete once logoUrl is set on the organization', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: { logoUrl: 'https://cdn/logo.png' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/onboarding/status',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().profileComplete).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/onboarding/status' })
    expect(res.statusCode).toBe(401)
  })
})
