import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('checkClientAuth', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  it('reports an authenticated client as authenticated', async () => {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
      },
    })

    const token = app.jwt.sign({ sub: client.id, type: 'client' })

    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/check-auth',
      cookies: { clientAccessToken: token },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ isAuthenticated: true })
  })

  it('lista os escritórios do login e marca o atual', async () => {
    // `createTestUser` nomeia a organização pessoal com o nome do usuário —
    // nomes distintos deixam a asserção legível.
    const first = await createTestUser({ name: 'Escritório Um' })
    const second = await createTestUser({ name: 'Escritório Dois' })

    const currentClient = await systemPrisma.client.create({
      data: {
        organizationId: first.organization.id,
        userId: first.user.id,
        name: 'Cliente Portal',
        mail: 'cliente@example.com',
        password: 'hash-irrelevante',
      },
    })

    const sibling = await systemPrisma.client.create({
      data: {
        organizationId: second.organization.id,
        userId: second.user.id,
        name: 'Cliente Portal',
        mail: 'cliente@example.com',
        password: 'hash-irrelevante',
      },
    })

    const token = app.jwt.sign({
      sub: currentClient.id,
      type: 'client',
      linked: [sibling.id],
    })

    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/check-auth',
      cookies: { clientAccessToken: token },
    })

    expect(response.statusCode).toBe(200)

    const organizations = response.json().organizations as Array<{
      id: string
      current: boolean
    }>

    expect(organizations).toHaveLength(2)
    expect(
      organizations.find((item) => item.id === first.organization.id)?.current,
    ).toBe(true)
    expect(
      organizations.find((item) => item.id === second.organization.id)?.current,
    ).toBe(false)
  })

  it('lista só o escritório atual quando o cookie não tem linked', async () => {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
        mail: 'cliente@example.com',
        password: 'hash-irrelevante',
      },
    })

    const token = app.jwt.sign({ sub: client.id, type: 'client' })

    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/check-auth',
      cookies: { clientAccessToken: token },
    })

    expect(response.json().organizations).toEqual([
      { id: organization.id, name: organization.name, current: true },
    ])
  })
})
