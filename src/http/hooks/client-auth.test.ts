import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('clientAuth', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  it('deixa o portal ler dados da organização do cliente', async () => {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
      },
    })

    await systemPrisma.case.create({
      data: {
        organizationId: organization.id,
        assignedToId: user.id,
        clientId: client.id,
        title: 'Caso do portal',
      },
    })

    const token = app.jwt.sign({ sub: client.id, type: 'client' })

    // Uses /client-portal/notifications, not the /dashboard route from the
    // brief's snippet: dashboard also selects office-identity fields
    // (user.phone, user.logoUrl) that moved off User in Task 2 and are only
    // reconnected in Task 10, which would make this test fail for an
    // unrelated, already-known reason instead of proving the tenant fix.
    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/notifications',
      cookies: { clientAccessToken: token },
    })

    expect(response.statusCode).toBe(200)
  })
})
