import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { MS_PER_DAY } from '@/utils/constants'

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

const baseRow = {
  input: {},
  result: {},
  engineVersion: 'v3',
}

async function publicRow(overrides: {
  tokenHash: string
  source?: string
  createdAt?: Date
  name?: string
  claimedAt?: Date
  claimedByOrganizationId?: string
  perspective?: string
}) {
  await systemPrisma.publicCalculation.create({
    data: {
      ...baseRow,
      source: overrides.source ?? 'site',
      perspective: overrides.perspective ?? 'trabalhador',
      tokenHash: overrides.tokenHash,
      createdAt: overrides.createdAt,
      name: overrides.name,
      claimedAt: overrides.claimedAt,
      claimedByOrganizationId: overrides.claimedByOrganizationId,
      expiresAt: new Date(Date.now() + 90 * MS_PER_DAY),
    },
  })
}

async function adminUser() {
  const { user, organization } = await createTestUser()
  await systemPrisma.user.update({
    where: { id: user.id },
    data: { isAdmin: true },
  })
  return { user, organization }
}

describe('GET /admin/funnel', () => {
  it('recusa sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/funnel' })
    expect(res.statusCode).toBe(401)
  })

  it('recusa usuário comum', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: '/admin/funnel',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(403)
  })

  it('conta criados, com contato e importados', async () => {
    const { user, organization } = await adminUser()

    await publicRow({ tokenHash: 'cru' })
    await publicRow({ tokenHash: 'com-contato', name: 'Maria' })
    await publicRow({
      tokenHash: 'importado',
      name: 'João',
      claimedAt: new Date(),
      claimedByOrganizationId: organization.id,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/admin/funnel',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(200)
    const { totals } = res.json()
    expect(totals.created).toBe(3)
    expect(totals.withContact).toBe(2)
    expect(totals.claimed).toBe(1)
    expect(totals.claimRate).toBeCloseTo(1 / 3, 4)
  })

  it('separa por porta de entrada', async () => {
    const { user } = await adminUser()

    await publicRow({ tokenHash: 'a', source: 'seo:horas-extras' })
    await publicRow({ tokenHash: 'b', source: 'seo:horas-extras', name: 'Ana' })
    await publicRow({ tokenHash: 'c', source: 'site' })

    const res = await app.inject({
      method: 'GET',
      url: '/admin/funnel',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    const { bySource } = res.json()
    expect(bySource[0]).toMatchObject({
      source: 'seo:horas-extras',
      created: 2,
      withContact: 1,
    })
    expect(bySource[1]).toMatchObject({ source: 'site', created: 1 })
  })

  it('separa trabalhador de empresa', async () => {
    const { user } = await adminUser()

    await publicRow({ tokenHash: 'p1' })
    await publicRow({ tokenHash: 'p2', perspective: 'empresa', name: 'RH' })
    await publicRow({ tokenHash: 'p3', perspective: 'empresa' })

    const res = await app.inject({
      method: 'GET',
      url: '/admin/funnel',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    const { byPerspective } = res.json()
    expect(byPerspective[0]).toMatchObject({
      perspective: 'empresa',
      created: 2,
      withContact: 1,
    })
    expect(byPerspective[1]).toMatchObject({
      perspective: 'trabalhador',
      created: 1,
    })
  })

  it('respeita a janela pedida', async () => {
    const { user } = await adminUser()

    await publicRow({ tokenHash: 'recente' })
    await publicRow({
      tokenHash: 'antigo',
      createdAt: new Date(Date.now() - 40 * MS_PER_DAY),
    })

    const res = await app.inject({
      method: 'GET',
      url: '/admin/funnel?days=7',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.json().totals.created).toBe(1)
  })

  it('conta cálculo importado por outra organização', async () => {
    const { user } = await adminUser()
    const { organization: outra } = await createTestUser({
      mail: 'outra@test.com',
      oabNumber: 'SP/9',
      document: '999',
    })

    const HOUR = 60 * 60 * 1000
    await publicRow({
      tokenHash: 'de-outro-escritorio',
      createdAt: new Date(Date.now() - 4 * HOUR),
      claimedAt: new Date(Date.now() - 2 * HOUR),
      claimedByOrganizationId: outra.id,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/admin/funnel',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    // A métrica é do produto, não do escritório de quem consulta.
    expect(res.json().totals.claimed).toBe(1)
    expect(res.json().medianHoursToClaim).toBeCloseTo(2, 1)
  })
})
