import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
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

function authToken(userId: string): string {
  return app.jwt.sign({ sub: userId })
}

const iso = (d: string) => new Date(d).toISOString()

describe('POST /agenda-events', () => {
  it('creates a personal event', async () => {
    const { user } = await createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/agenda-events',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: {
        title: 'Reunião com cliente',
        startsAt: iso('2026-08-01T14:00:00Z'),
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().id).toEqual(expect.any(String))
  })

  it('returns 400 with empty title', async () => {
    const { user } = await createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/agenda-events',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { title: '', startsAt: iso('2026-08-01T14:00:00Z') },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agenda-events',
      payload: { title: 'X', startsAt: iso('2026-08-01T14:00:00Z') },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /agenda-events', () => {
  it('lists only own events within the range', async () => {
    const { user: userA, organization: organizationA } = await createTestUser({
      mail: 'a@t.com',
      oabNumber: 'SP/1',
      document: '1',
    })
    const { user: userB, organization: organizationB } = await createTestUser({
      mail: 'b@t.com',
      oabNumber: 'SP/2',
      document: '2',
    })
    await systemPrisma.agendaEvent.create({
      data: {
        userId: userA.id,
        title: 'Dentro',
        startsAt: new Date('2026-08-10T10:00:00Z'),
        organizationId: organizationA.id,
      },
    })
    await systemPrisma.agendaEvent.create({
      data: {
        userId: userA.id,
        title: 'Fora',
        startsAt: new Date('2026-12-10T10:00:00Z'),
        organizationId: organizationA.id,
      },
    })
    await systemPrisma.agendaEvent.create({
      data: {
        userId: userB.id,
        title: 'De B',
        startsAt: new Date('2026-08-11T10:00:00Z'),
        organizationId: organizationB.id,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/agenda-events?from=${iso('2026-08-01T00:00:00Z')}&to=${iso('2026-08-31T23:59:59Z')}`,
      headers: { authorization: `Bearer ${authToken(userA.id)}` },
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data).toHaveLength(1)
    expect(data[0].title).toBe('Dentro')
  })
})

describe('PATCH /agenda-events/:id', () => {
  it('marks an event as done and back to pending', async () => {
    const { user, organization } = await createTestUser()
    const ev = await systemPrisma.agendaEvent.create({
      data: {
        userId: user.id,
        title: 'Tarefa',
        startsAt: new Date('2026-08-01T14:00:00Z'),
        organizationId: organization.id,
      },
    })
    const headers = { authorization: `Bearer ${authToken(user.id)}` }

    await app.inject({
      method: 'PATCH',
      url: `/agenda-events/${ev.id}`,
      headers,
      payload: { done: true },
    })
    let row = await systemPrisma.agendaEvent.findUnique({
      where: { id: ev.id },
    })
    expect(row?.doneAt).toBeInstanceOf(Date)

    await app.inject({
      method: 'PATCH',
      url: `/agenda-events/${ev.id}`,
      headers,
      payload: { done: false },
    })
    row = await systemPrisma.agendaEvent.findUnique({ where: { id: ev.id } })
    expect(row?.doneAt).toBeNull()
  })

  it("cannot update another user's event (404)", async () => {
    const { user: userA, organization: organizationA } = await createTestUser({
      mail: 'a@t.com',
      oabNumber: 'SP/1',
      document: '1',
    })
    const { user: userB } = await createTestUser({
      mail: 'b@t.com',
      oabNumber: 'SP/2',
      document: '2',
    })
    const ev = await systemPrisma.agendaEvent.create({
      data: {
        userId: userA.id,
        title: 'De A',
        startsAt: new Date('2026-08-01T14:00:00Z'),
        organizationId: organizationA.id,
      },
    })
    const res = await app.inject({
      method: 'PATCH',
      url: `/agenda-events/${ev.id}`,
      headers: { authorization: `Bearer ${authToken(userB.id)}` },
      payload: { title: 'Hacked' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /agenda-events/:id', () => {
  it('deletes an own event', async () => {
    const { user, organization } = await createTestUser()
    const ev = await systemPrisma.agendaEvent.create({
      data: {
        userId: user.id,
        title: 'Remover',
        startsAt: new Date('2026-08-01T14:00:00Z'),
        organizationId: organization.id,
      },
    })
    const res = await app.inject({
      method: 'DELETE',
      url: `/agenda-events/${ev.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(res.statusCode).toBe(204)
    const row = await systemPrisma.agendaEvent.findUnique({
      where: { id: ev.id },
    })
    expect(row).toBeNull()
  })
})
