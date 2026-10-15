import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import {
  cleanDatabase,
  createMember,
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

function get(userId: string) {
  return app.inject({
    method: 'GET',
    url: '/dashboard/next-action',
    headers: { authorization: `Bearer ${authToken(userId)}` },
  })
}

/** Cliente + caso + cálculo + logo: fecha o checklist para sair da fase setup. */
async function completeSetup(userId: string, organizationId: string) {
  await systemPrisma.organization.update({
    where: { id: organizationId },
    data: { logoUrl: 'https://cdn/logo.png' },
  })
  const client = await systemPrisma.client.create({
    data: { name: 'Maria Silva', userId, organizationId },
  })
  const kase = await systemPrisma.case.create({
    data: {
      title: 'Maria Silva x Empresa',
      assignedToId: userId,
      organizationId,
      clientId: client.id,
    },
  })
  const calc = await createTestCalculation(userId, organizationId, {
    clientId: client.id,
    caseId: kase.id,
    clientName: 'Maria Silva',
  })
  return { client, kase, calc }
}

function overdueDeadline(caseId: string, organizationId: string) {
  return systemPrisma.deadline.create({
    data: {
      caseId,
      organizationId,
      kind: 'outros',
      dueAt: new Date('2020-01-01'),
    },
  })
}

describe('GET /dashboard/next-action', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/next-action',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns the setup phase pointing at the client step on a fresh account', async () => {
    const { user } = await createTestUser()

    const res = await get(user.id)

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      phase: 'setup',
      to: '/clients/new',
      progress: { completed: 0, total: 4 },
    })
  })

  it('returns the attention phase naming the overdue deadline', async () => {
    const { user, organization } = await createTestUser()
    const { kase } = await completeSetup(user.id, organization.id)
    await overdueDeadline(kase.id, organization.id)

    const res = await get(user.id)

    expect(res.statusCode).toBe(200)
    expect(res.json().phase).toBe('attention')
    expect(res.json().to).toBe(`/cases/${kase.id}/prazos`)
  })

  it('prefers setup over attention while the checklist is open', async () => {
    const { user, organization } = await createTestUser()
    const client = await systemPrisma.client.create({
      data: { name: 'Maria', userId: user.id, organizationId: organization.id },
    })
    const kase = await systemPrisma.case.create({
      data: {
        title: 'Maria x Empresa',
        assignedToId: user.id,
        organizationId: organization.id,
        clientId: client.id,
      },
    })
    await overdueDeadline(kase.id, organization.id)

    const res = await get(user.id)

    expect(res.json().phase).toBe('setup')
  })

  it('returns the resume phase naming the most recent calculation', async () => {
    const { user, organization } = await createTestUser()
    const { calc } = await completeSetup(user.id, organization.id)

    const res = await get(user.id)

    expect(res.json().phase).toBe('resume')
    expect(res.json().to).toBe(`/calculations/${calc.id}`)
    expect(res.json().title).toContain('Maria Silva')
  })

  it('returns the idle phase when the recent work is older than the window', async () => {
    const { user, organization } = await createTestUser()
    const { kase, calc } = await completeSetup(user.id, organization.id)
    const old = new Date('2020-01-01')
    await systemPrisma.$executeRaw`UPDATE "LaborCalculation" SET "updatedAt" = ${old} WHERE id = ${calc.id}`
    await systemPrisma.$executeRaw`UPDATE "Case" SET "updatedAt" = ${old} WHERE id = ${kase.id}`

    const res = await get(user.id)

    expect(res.json()).toMatchObject({
      phase: 'idle',
      to: '/calculations/new',
    })
  })

  it('does not surface an attention item on a case the role cannot see', async () => {
    const { user, organization } = await createTestUser()
    const { kase } = await completeSetup(user.id, organization.id)
    await overdueDeadline(kase.id, organization.id)
    // `lawyer` só enxerga caso atribuído a ele; o caso acima é do titular.
    const member = await createMember(organization.id, 'lawyer')

    const res = await get(member.user.id)

    expect(res.json().phase).not.toBe('attention')
  })
})
