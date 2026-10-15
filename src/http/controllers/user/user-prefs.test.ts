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

describe('user prefs — opt-out dos nudges de onboarding', () => {
  it('defaults onbNudgeOptOut to false', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: '/user/prefs',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().onbNudgeOptOut).toBe(false)
  })

  it('persists the opt-out without touching the deadline reminders', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'PATCH',
      url: '/user/prefs',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { onbNudgeOptOut: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      onbNudgeOptOut: true,
      remindD1: true,
      remindD3: true,
    })
  })
})
