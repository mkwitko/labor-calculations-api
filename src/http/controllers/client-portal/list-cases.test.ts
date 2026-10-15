import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('GET /client-portal/cases', () => {
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

    const first = await systemPrisma.case.create({
      data: {
        organizationId: organization.id,
        assignedToId: user.id,
        clientId: client.id,
        title: 'Processo A',
        phase: 'distribuido',
      },
    })

    const second = await systemPrisma.case.create({
      data: {
        organizationId: organization.id,
        assignedToId: user.id,
        clientId: client.id,
        title: 'Processo B',
        phase: 'conhecimento',
      },
    })

    await systemPrisma.case.create({
      data: {
        organizationId: organization.id,
        assignedToId: user.id,
        clientId: other.id,
        title: 'Processo de outra pessoa',
        phase: 'distribuido',
      },
    })

    return { organization, user, client, first, second }
  }

  function clientToken(clientId: string) {
    return app.jwt.sign({ sub: clientId, type: 'client' })
  }

  it('returns every case of the authenticated client', async () => {
    const { client } = await scenario()

    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/cases',
      cookies: { clientAccessToken: clientToken(client.id) },
    })

    expect(response.statusCode).toBe(200)

    const titles = response
      .json()
      .cases.map((item: { title: string }) => item.title)
    expect(titles).toHaveLength(2)
    expect(titles).toEqual(expect.arrayContaining(['Processo A', 'Processo B']))
  })

  it('does not leak the case of another client', async () => {
    const { client } = await scenario()

    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/cases',
      cookies: { clientAccessToken: clientToken(client.id) },
    })

    const titles = response
      .json()
      .cases.map((item: { title: string }) => item.title)
    expect(titles).not.toContain('Processo de outra pessoa')
  })

  it('reports pending documents and the next hearing per case', async () => {
    const { organization, client, first } = await scenario()

    await systemPrisma.documentRequirement.create({
      data: {
        organizationId: organization.id,
        caseId: first.id,
        kind: 'outros',
        description: 'CTPS',
        status: 'pendente',
      },
    })

    const scheduledAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)

    await systemPrisma.hearing.create({
      data: {
        organizationId: organization.id,
        caseId: first.id,
        scheduledAt,
        kind: 'inicial',
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/cases',
      cookies: { clientAccessToken: clientToken(client.id) },
    })

    const row = response
      .json()
      .cases.find((item: { id: string }) => item.id === first.id)

    expect(row.pendingDocuments).toBe(1)
    expect(row.nextHearingAt).toBe(scheduledAt.toISOString())
  })

  it('rejects an unauthenticated request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/cases',
    })

    expect(response.statusCode).toBe(401)
  })
})
