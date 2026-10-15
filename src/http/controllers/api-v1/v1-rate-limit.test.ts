import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { issueApiKey } from '@/services/api/api-key-service'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

/**
 * O único teste que provoca 429 de propósito. O limite por rota vale em
 * `ENV=test` (o `app.ts` só afrouxa o global), e é isso que o torna possível.
 */
describe('limite por chave em /v1', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  it('a 61ª chamada da mesma chave é recusada', async () => {
    const { user, organization } = await createTestUser()
    const issued = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'ERP',
    })

    let last = 0
    for (let i = 0; i < 61; i++) {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/calculations/inexistente',
        headers: { authorization: `Bearer ${issued.token}` },
      })
      last = response.statusCode
    }

    expect(last).toBe(429)
  })

  it('a cota é da chave, não do IP', async () => {
    const { user, organization } = await createTestUser()
    const first = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'ERP',
    })
    const second = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'Site',
    })

    for (let i = 0; i < 61; i++) {
      await app.inject({
        method: 'GET',
        url: '/v1/calculations/inexistente',
        headers: { authorization: `Bearer ${first.token}` },
      })
    }

    // Mesmo processo, mesmo IP, chave diferente: a segunda começa do zero.
    // Sem `keyGenerator` por prefixo, esta chamada herdaria o 429 da primeira.
    const response = await app.inject({
      method: 'GET',
      url: '/v1/calculations/inexistente',
      headers: { authorization: `Bearer ${second.token}` },
    })

    expect(response.statusCode).toBe(404)
  })
})
