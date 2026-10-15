import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createOrganizationWithRoles } from '@/tests/helpers/db'

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

function token(userId: string, organizationId: string): string {
  return app.jwt.sign({ sub: userId, org: organizationId })
}

async function scenario() {
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
  await systemPrisma.hearing.create({
    data: {
      caseId: ownerCase.id,
      organizationId: roles.organization.id,
      kind: 'inicial',
      scheduledAt: new Date('2026-09-10T14:00:00Z'),
    },
  })
  return { ...roles, ownerCase, lawyerCase }
}

describe('filhos do caso seguem a visibilidade do caso', () => {
  it('lawyer não vê audiência de caso alheio na agenda', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'GET',
      url: '/hearings',
      headers: {
        authorization: `Bearer ${token(s.lawyer.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)
  })

  it('staff vê audiência de qualquer caso da organização', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'GET',
      url: '/hearings',
      headers: {
        authorization: `Bearer ${token(s.staff.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('lawyer recebe 404 ao listar tarefas de caso alheio', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'GET',
      url: `/cases/${s.ownerCase.id}/tasks`,
      headers: {
        authorization: `Bearer ${token(s.lawyer.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('staff recebe 403 ao criar tarefa em caso que enxerga', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${s.ownerCase.id}/tasks`,
      headers: {
        authorization: `Bearer ${token(s.staff.id, s.organization.id)}`,
      },
      payload: { title: 'Protocolar petição' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('lawyer recebe 403 ao ler o honorário do caso dele', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'GET',
      url: `/cases/${s.lawyerCase.id}/fee-agreement`,
      headers: {
        authorization: `Bearer ${token(s.lawyer.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(403)
  })

  it('staff lê e grava o honorário', async () => {
    const s = await scenario()
    const headers = {
      authorization: `Bearer ${token(s.staff.id, s.organization.id)}`,
    }

    const write = await app.inject({
      method: 'PUT',
      url: `/cases/${s.ownerCase.id}/fee-agreement`,
      headers,
      payload: { feeType: 'percentual', percent: 30 },
    })
    expect(write.statusCode).toBeLessThan(300)

    const read = await app.inject({
      method: 'GET',
      url: `/cases/${s.ownerCase.id}/fee-agreement`,
      headers,
    })
    expect(read.statusCode).toBe(200)
  })

  it('intern recebe 403 ao criar audiência no caso atribuído a ele', async () => {
    const s = await scenario()
    const internCase = await systemPrisma.case.create({
      data: {
        title: 'Caso do estagiário',
        assignedToId: s.intern.id,
        organizationId: s.organization.id,
      },
      select: { id: true },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/cases/${internCase.id}/hearings`,
      headers: {
        authorization: `Bearer ${token(s.intern.id, s.organization.id)}`,
      },
      payload: { kind: 'inicial', scheduledAt: '2026-10-01T13:00:00.000Z' },
    })

    expect(res.statusCode).toBe(403)
  })
})
