import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('mensagens do portal', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  async function scenario() {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
      },
    })

    const other = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Outro Cliente',
      },
    })

    const own = await systemPrisma.case.create({
      data: {
        organizationId: organization.id,
        assignedToId: user.id,
        clientId: client.id,
        title: 'Processo A',
        phase: 'distribuido',
      },
    })

    const alien = await systemPrisma.case.create({
      data: {
        organizationId: organization.id,
        assignedToId: user.id,
        clientId: other.id,
        title: 'Processo de outra pessoa',
        phase: 'distribuido',
      },
    })

    await systemPrisma.message.create({
      data: {
        caseId: own.id,
        organizationId: organization.id,
        authorKind: 'lawyer',
        userId: user.id,
        body: 'Bom dia, precisamos do contracheque',
      },
    })

    return { user, client, own, alien }
  }

  function clientToken(clientId: string) {
    return app.jwt.sign({ sub: clientId, type: 'client' })
  }

  it('lista a thread do próprio caso', async () => {
    const { client, own, user } = await scenario()

    const response = await app.inject({
      method: 'GET',
      url: `/client-portal/cases/${own.id}/messages`,
      cookies: { clientAccessToken: clientToken(client.id) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().items).toHaveLength(1)
    expect(response.json().items[0].authorName).toBe(user.name)
  })

  it('não enxerga caso de outro cliente', async () => {
    const { client, alien } = await scenario()

    const response = await app.inject({
      method: 'GET',
      url: `/client-portal/cases/${alien.id}/messages`,
      cookies: { clientAccessToken: clientToken(client.id) },
    })

    expect(response.statusCode).toBe(404)
  })

  it('envia mensagem e ela nasce não lida para o advogado', async () => {
    const { client, own } = await scenario()

    const response = await app.inject({
      method: 'POST',
      url: `/client-portal/cases/${own.id}/messages`,
      cookies: { clientAccessToken: clientToken(client.id) },
      payload: { body: 'Segue em anexo' },
    })

    expect(response.statusCode).toBe(201)

    const created = await systemPrisma.message.findUniqueOrThrow({
      where: { id: response.json().id },
    })
    expect(created.authorKind).toBe('client')
    expect(created.clientId).toBe(client.id)
    expect(created.readByLawyerAt).toBeNull()
  })
})
