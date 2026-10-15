import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('forgotPassword', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  async function clientOf(notes?: string) {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
        mail: 'cliente@example.com',
        notes,
      },
    })

    return { user, client }
  }

  function request(mail = 'cliente@example.com') {
    return app.inject({
      method: 'POST',
      url: '/client-portal/forgot-password',
      payload: { mail },
    })
  }

  it('aceita a solicitação para um cliente existente sem estourar contexto de tenant', async () => {
    await clientOf()

    expect((await request()).statusCode).toBe(200)
  })

  it('grava o token em ClientAccessToken, não em Client.notes', async () => {
    const { client } = await clientOf('Anotação do advogado')

    await request()

    const stored = await systemPrisma.client.findUniqueOrThrow({
      where: { id: client.id },
      select: { notes: true },
    })
    expect(stored.notes).toBe('Anotação do advogado')

    const tokens = await systemPrisma.clientAccessToken.findMany({
      where: { clientId: client.id },
    })
    expect(tokens).toHaveLength(1)
    expect(tokens[0].purpose).toBe('reset')
    expect(tokens[0].usedAt).toBeNull()
  })

  // Pedir um link novo mata o anterior — coberto em
  // `services/client-portal/client-access-token.test.ts`. Não se repete aqui
  // porque esta rota tem limite de 3 requisições por 15 minutos, que vale
  // também em teste: um pedido a mais devolveria 429 no lugar do que se afere.
})
