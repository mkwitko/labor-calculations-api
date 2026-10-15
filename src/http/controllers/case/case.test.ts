import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import {
  cleanDatabase,
  createOrganizationWithRoles,
  createTestCalculation,
  createTestUser,
} from '@/tests/helpers/db'

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

async function twoUsers() {
  const { user: userA, organization: organizationA } = await createTestUser({
    mail: 'a@test.com',
    oabNumber: 'SP/1',
    document: '111',
  })
  const { user: userB, organization: organizationB } = await createTestUser({
    mail: 'b@test.com',
    oabNumber: 'SP/2',
    document: '222',
  })
  return { userA, userB, organizationA, organizationB }
}

describe('POST /cases', () => {
  it('creates a case and returns its id', async () => {
    const { user } = await createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { title: 'Reclamação trabalhista', phase: 'distribuido' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().id).toEqual(expect.any(String))
  })

  it('records a case_created activity', async () => {
    const { user } = await createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { title: 'Caso com atividade' },
    })

    const activities = await systemPrisma.activity.findMany({
      where: { caseId: res.json().id },
    })
    expect(activities).toHaveLength(1)
    expect(activities[0].kind).toBe('case_created')
  })

  it('links a calculation given on creation', async () => {
    const { user, organization } = await createTestUser()
    const calculation = await createTestCalculation(user.id, organization.id)

    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { title: 'Caso com cálculo', calculationId: calculation.id },
    })

    expect(res.statusCode).toBe(201)

    const linked = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id: calculation.id },
      select: { caseId: true },
    })
    expect(linked.caseId).toBe(res.json().id)

    const activities = await systemPrisma.activity.findMany({
      where: { caseId: res.json().id },
      orderBy: { createdAt: 'asc' },
    })
    expect(activities.map((a) => a.kind)).toEqual([
      'case_created',
      'calc_linked',
    ])
  })

  // A conferência acontece antes do create de propósito: um vínculo que falha
  // não pode deixar um caso órfão para trás.
  it('creates no case when the calculation does not exist', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { title: 'Caso inválido', calculationId: 'nao-existe' },
    })

    expect(res.statusCode).toBe(404)
    expect(await systemPrisma.case.count()).toBe(0)
  })

  it('does not link a calculation from another organization', async () => {
    const { userA } = await twoUsers()
    const { user: outsider, organization: otherOrg } = await createTestUser({
      mail: 'c@test.com',
      oabNumber: 'SP/3',
      document: '333',
    })
    const calculation = await createTestCalculation(outsider.id, otherOrg.id)

    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(userA.id)}` },
      payload: { title: 'Caso alheio', calculationId: calculation.id },
    })

    expect(res.statusCode).toBe(404)
  })

  it('returns 400 with empty title', async () => {
    const { user } = await createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { title: '' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      payload: { title: 'X' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /cases', () => {
  it('lists only own cases and can filter by phase', async () => {
    const { userA, userB, organizationA, organizationB } = await twoUsers()
    await systemPrisma.case.create({
      data: {
        assignedToId: userA.id,
        title: 'A execução',
        phase: 'execucao',
        organizationId: organizationA.id,
      },
    })
    await systemPrisma.case.create({
      data: {
        assignedToId: userA.id,
        title: 'A recurso',
        phase: 'recurso',
        organizationId: organizationA.id,
      },
    })
    await systemPrisma.case.create({
      data: {
        assignedToId: userB.id,
        title: 'B caso',
        phase: 'execucao',
        organizationId: organizationB.id,
      },
    })

    const all = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(userA.id)}` },
    })
    expect(all.statusCode).toBe(200)
    expect(all.json().data).toHaveLength(2)

    const filtered = await app.inject({
      method: 'GET',
      url: '/cases?phase=execucao',
      headers: { authorization: `Bearer ${authToken(userA.id)}` },
    })
    expect(filtered.json().data).toHaveLength(1)
    expect(filtered.json().data[0].title).toBe('A execução')
  })

  it('omits soft-deleted cases', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.case.create({
      data: {
        assignedToId: user.id,
        title: 'Ativo',
        organizationId: organization.id,
      },
    })
    await systemPrisma.case.create({
      data: {
        assignedToId: user.id,
        title: 'Removido',
        deletedAt: new Date(),
        organizationId: organization.id,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(res.json().data).toHaveLength(1)
    expect(res.json().data[0].title).toBe('Ativo')
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/cases' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /cases/:caseId', () => {
  it('returns the case for its owner', async () => {
    const { user, organization } = await createTestUser()
    const c = await systemPrisma.case.create({
      data: {
        assignedToId: user.id,
        title: 'Meu caso',
        organizationId: organization.id,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/cases/${c.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(c.id)
  })

  it("returns 404 for another user's case", async () => {
    const { userA, userB, organizationA } = await twoUsers()
    const c = await systemPrisma.case.create({
      data: {
        assignedToId: userA.id,
        title: 'De A',
        organizationId: organizationA.id,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/cases/${c.id}`,
      headers: { authorization: `Bearer ${authToken(userB.id)}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for a non-existent case', async () => {
    const { user } = await createTestUser()
    const res = await app.inject({
      method: 'GET',
      url: '/cases/clxxxxnonexistent',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /cases/:caseId', () => {
  it('soft-deletes the case', async () => {
    const { user, organization } = await createTestUser()
    const c = await systemPrisma.case.create({
      data: {
        assignedToId: user.id,
        title: 'Para remover',
        organizationId: organization.id,
      },
    })

    const del = await app.inject({
      method: 'DELETE',
      url: `/cases/${c.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(del.statusCode).toBe(204)

    const row = await systemPrisma.case.findUnique({ where: { id: c.id } })
    expect(row?.deletedAt).toBeInstanceOf(Date)
  })

  it("cannot delete another user's case (404)", async () => {
    const { userA, userB, organizationA } = await twoUsers()
    const c = await systemPrisma.case.create({
      data: {
        assignedToId: userA.id,
        title: 'De A',
        organizationId: organizationA.id,
      },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/cases/${c.id}`,
      headers: { authorization: `Bearer ${authToken(userB.id)}` },
    })
    expect(res.statusCode).toBe(404)

    const row = await systemPrisma.case.findUnique({ where: { id: c.id } })
    expect(row?.deletedAt).toBeNull()
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/cases/whatever' })
    expect(res.statusCode).toBe(401)
  })
})

describe('visibilidade de caso por papel', () => {
  function memberToken(userId: string, organizationId: string): string {
    return app.jwt.sign({ sub: userId, org: organizationId })
  }

  async function orgWithTwoCases() {
    const roles = await createOrganizationWithRoles()
    const ownerCase = await systemPrisma.case.create({
      data: {
        title: 'Caso do owner',
        assignedToId: roles.owner.id,
        organizationId: roles.organization.id,
      },
      select: { id: true },
    })
    const lawyerCase = await systemPrisma.case.create({
      data: {
        title: 'Caso do associado',
        assignedToId: roles.lawyer.id,
        organizationId: roles.organization.id,
      },
      select: { id: true },
    })
    return { ...roles, ownerCase, lawyerCase }
  }

  it('lawyer lista só o caso atribuído a ele', async () => {
    const s = await orgWithTwoCases()
    const res = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: {
        authorization: `Bearer ${memberToken(s.lawyer.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.map((c: { id: string }) => c.id)).toEqual([
      s.lawyerCase.id,
    ])
  })

  it('staff lista todos os casos da organização', async () => {
    const s = await orgWithTwoCases()
    const res = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: {
        authorization: `Bearer ${memberToken(s.staff.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toHaveLength(2)
  })

  it('lawyer recebe 404 no caso de outro membro', async () => {
    const s = await orgWithTwoCases()
    const res = await app.inject({
      method: 'GET',
      url: `/cases/${s.ownerCase.id}`,
      headers: {
        authorization: `Bearer ${memberToken(s.lawyer.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('staff lê o caso mas recebe 403 ao editar', async () => {
    const s = await orgWithTwoCases()
    const headers = {
      authorization: `Bearer ${memberToken(s.staff.id, s.organization.id)}`,
    }

    const read = await app.inject({
      method: 'GET',
      url: `/cases/${s.lawyerCase.id}`,
      headers,
    })
    expect(read.statusCode).toBe(200)

    const write = await app.inject({
      method: 'PATCH',
      url: `/cases/${s.lawyerCase.id}`,
      headers,
      payload: { title: 'Título novo' },
    })
    expect(write.statusCode).toBe(403)
  })

  it('intern recebe 403 ao criar caso', async () => {
    const s = await orgWithTwoCases()
    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: {
        authorization: `Bearer ${memberToken(s.intern.id, s.organization.id)}`,
      },
      payload: { title: 'Caso do estagiário' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('caso criado por lawyer fica atribuído a ele', async () => {
    const s = await orgWithTwoCases()
    const res = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: {
        authorization: `Bearer ${memberToken(s.lawyer.id, s.organization.id)}`,
      },
      payload: { title: 'Caso novo' },
    })

    expect(res.statusCode).toBe(201)
    const created = await systemPrisma.case.findUnique({
      where: { id: res.json().id },
      select: { assignedToId: true },
    })
    expect(created?.assignedToId).toBe(s.lawyer.id)
  })
})
