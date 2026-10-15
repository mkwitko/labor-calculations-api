import Fastify from 'fastify'
import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { errorHandler } from '@/http/exceptions/handler/error-handler'
import { apiKeyAuth } from '@/http/hooks/api-key-auth'
import { runWithTenantStore } from '@/lib/tenant-context'
import { issueApiKey } from '@/services/api/api-key-service'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

function buildApp() {
  const app = Fastify()
  app.setErrorHandler(errorHandler)
  // Mesmo hook do `app.ts`: sem o store aberto em estilo callback,
  // `setActiveOrganization` não tem onde escrever e o hook estoura em 500.
  app.addHook('onRequest', (_request, _reply, done) => {
    runWithTenantStore(done)
  })
  app.get('/teste', { preHandler: [apiKeyAuth] }, async (request) => ({
    organizationId: request.apiKey?.organizationId,
  }))
  return app
}

beforeEach(async () => {
  await cleanDatabase()
})

afterAll(async () => {
  await systemPrisma.$disconnect()
})

describe('apiKeyAuth', () => {
  it('resolve a organização da chave', async () => {
    const { user, organization } = await createTestUser()
    const issued = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'ERP',
    })

    const app = buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/teste',
      headers: { authorization: `Bearer ${issued.token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().organizationId).toBe(organization.id)
    await app.close()
  })

  it('recusa sem header', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/teste' })

    expect(response.statusCode).toBe(401)
    await app.close()
  })

  it('recusa token que não é chave de API', async () => {
    const app = buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/teste',
      headers: { authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.qualquer.jwt' },
    })

    expect(response.statusCode).toBe(401)
    await app.close()
  })
})
