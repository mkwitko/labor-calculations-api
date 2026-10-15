import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await cleanDatabase()
})

// GET /clients is used as the authenticated route under test because it
// does not read any of the office-identity fields that moved off `User`
// (still broken until Task 10) — it only exercises the auth hook wiring.
function tokenFor(userId: string, org?: string): string {
  return app.jwt.sign(org ? { sub: userId, org } : { sub: userId })
}

describe('auth hook — resolução de organização', () => {
  it('token com org de uma membership viva: sucesso', async () => {
    const { user, organization } = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: '/clients',
      headers: {
        authorization: `Bearer ${tokenFor(user.id, organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('token com org de organização de que não é membro: 401 e desloga', async () => {
    const { user } = await createTestUser()
    const outro = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: '/clients',
      headers: {
        authorization: `Bearer ${tokenFor(user.id, outro.organization.id)}`,
      },
    })

    // Sessão que aponta para organização de que não se é membro não é falta de
    // permissão: é sessão inválida. 401 é o que faz o front deslogar.
    expect(res.statusCode).toBe(401)

    const cookies = res.cookies.map((c) => `${c.name}=${c.value}`)
    expect(cookies).toContain('accessToken=')
    expect(cookies).toContain('refreshToken=')
  })

  it('token cuja membership foi removida depois de emitido: 401 e desloga', async () => {
    const { user, organization } = await createTestUser()
    const token = tokenFor(user.id, organization.id)

    await systemPrisma.membership.updateMany({
      where: { userId: user.id, organizationId: organization.id },
      data: { deletedAt: new Date() },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/clients',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(401)

    const cookies = res.cookies.map((c) => `${c.name}=${c.value}`)
    expect(cookies).toContain('accessToken=')
    expect(cookies).toContain('refreshToken=')
  })

  it('token sem claim org: age na única organização do usuário', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: '/clients',
      headers: { authorization: `Bearer ${tokenFor(user.id)}` },
    })

    expect(res.statusCode).toBe(200)
  })
})
