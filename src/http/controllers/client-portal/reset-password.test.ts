import { verify } from 'argon2'
import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { issueClientAccessToken } from '@/services/client-portal/client-access-token'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('resetPassword', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  async function clientWithResetToken(notes = 'Anotação do advogado') {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
        notes,
      },
    })

    const { token } = await issueClientAccessToken({
      clientId: client.id,
      organizationId: organization.id,
      purpose: 'reset',
    })

    return { client, token }
  }

  function resetWith(token: string, newPassword = 'NovaSenha123') {
    return app.inject({
      method: 'POST',
      url: '/client-portal/reset-password',
      payload: { token, newPassword },
    })
  }

  it('resets the password with a valid token', async () => {
    const { client, token } = await clientWithResetToken()

    const response = await resetWith(token)

    expect(response.statusCode).toBe(200)

    const updated = await systemPrisma.client.findUniqueOrThrow({
      where: { id: client.id },
      select: { password: true, mustChangePassword: true },
    })

    expect(updated.mustChangePassword).toBe(false)
    expect(await verify(updated.password ?? '', 'NovaSenha123')).toBe(true)
  })

  // O token vivia serializado dentro de `Client.notes`, e tanto o pedido quanto
  // a redefinição sobrescreviam o campo — apagando o que o advogado escreveu.
  it('leaves the lawyer notes untouched', async () => {
    const { client, token } = await clientWithResetToken(
      'Cliente é sindicalizado',
    )

    await resetWith(token)

    const updated = await systemPrisma.client.findUniqueOrThrow({
      where: { id: client.id },
      select: { notes: true },
    })

    expect(updated.notes).toBe('Cliente é sindicalizado')
  })

  // Reuso, expiração, propósito trocado e token inexistente ficam em
  // `client-access-token.test.ts`, no nível do serviço: a rota tem limite de 5
  // requisições por 15 minutos e o limite por rota vale também em teste, então
  // exercitar cada recusa por HTTP faria o arquivo colher 429 em vez de 400.
  it('refuses to reuse a token', async () => {
    const { token } = await clientWithResetToken()

    expect((await resetWith(token)).statusCode).toBe(200)
    expect((await resetWith(token, 'other-pass-1')).statusCode).toBe(400)
  })
})
