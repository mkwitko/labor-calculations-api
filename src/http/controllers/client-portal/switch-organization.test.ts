import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('switchClientOrganization', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  async function accountFor(mail: string, mustChangePassword = false) {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
        mail,
        password: 'hash-irrelevante',
        mustChangePassword,
      },
    })

    return { client, organization }
  }

  function switchTo(token: string, organizationId: string) {
    return app.inject({
      method: 'POST',
      url: '/client-portal/switch',
      cookies: { clientAccessToken: token },
      payload: { organizationId },
    })
  }

  it('troca de escritório e reemite o cookie apontando para o irmão', async () => {
    const current = await accountFor('cliente@example.com')
    const target = await accountFor('cliente@example.com', true)

    const token = app.jwt.sign({
      sub: current.client.id,
      type: 'client',
      linked: [target.client.id],
    })

    const response = await switchTo(token, target.organization.id)

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ mustChangePassword: true })

    const cookie = response.cookies.find(
      (item) => item.name === 'clientAccessToken',
    )
    const payload = app.jwt.verify<{ sub: string; linked?: string[] }>(
      cookie?.value ?? '',
    )

    expect(payload.sub).toBe(target.client.id)
    expect(payload.linked).toEqual([current.client.id])
  })

  it('recusa alvo que não está em linked', async () => {
    const current = await accountFor('cliente@example.com')
    const stranger = await accountFor('cliente@example.com')

    const token = app.jwt.sign({
      sub: current.client.id,
      type: 'client',
      linked: [],
    })

    const response = await switchTo(token, stranger.organization.id)

    expect(response.statusCode).toBe(404)
  })

  it('recusa alvo apagado depois do login', async () => {
    const current = await accountFor('cliente@example.com')
    const target = await accountFor('cliente@example.com')

    await systemPrisma.client.update({
      where: { id: target.client.id },
      data: { deletedAt: new Date() },
    })

    const token = app.jwt.sign({
      sub: current.client.id,
      type: 'client',
      linked: [target.client.id],
    })

    const response = await switchTo(token, target.organization.id)

    expect(response.statusCode).toBe(404)
  })

  it('exige sessão de cliente', async () => {
    const target = await accountFor('cliente@example.com')

    const response = await app.inject({
      method: 'POST',
      url: '/client-portal/switch',
      payload: { organizationId: target.organization.id },
    })

    expect(response.statusCode).toBe(401)
  })
})
