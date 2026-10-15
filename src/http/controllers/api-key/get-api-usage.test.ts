import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { issueApiKey } from '@/services/api/api-key-service'
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

describe('GET /api-keys/usage', () => {
  it('devolve o consumo do ciclo', async () => {
    const { organization, user } = await createTestUser()

    const key = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'ERP',
    })

    await systemPrisma.apiUsage.create({
      data: {
        organizationId: organization.id,
        apiKeyId: key.id,
        endpoint: 'POST /v1/calculations/liquidacao',
      },
    })

    // Autenticação de teste neste repo é o JWT assinado na hora, como em
    // `role-matrix.test.ts` — não há helper de sessão.
    const token = app.jwt.sign({ sub: user.id, org: organization.id })

    const response = await app.inject({
      method: 'GET',
      url: '/api-keys/usage',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)

    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.byKey[0]).toMatchObject({ name: 'ERP', mode: 'live', calls: 1 })
    // Sem preço legível a tela mostra só a contagem.
    expect(body).toHaveProperty('estimatedCents')
  })

  it('exige autenticação', async () => {
    const response = await app.inject({ method: 'GET', url: '/api-keys/usage' })

    expect(response.statusCode).toBe(401)
  })
})
