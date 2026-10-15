import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import {
  cleanDatabase,
  createOrganizationWithRoles,
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

/**
 * A pessoa com duas organizações: dona da carteira própria (criada por
 * `createTestUser`) e associada num escritório. É o caso que o spec descreve
 * como duas cobranças e um switcher.
 */
async function personWithTwoOrganizations() {
  const { user, organization: personal } = await createTestUser()
  const office = await createOrganizationWithRoles()

  await systemPrisma.membership.create({
    data: {
      userId: user.id,
      organizationId: office.organization.id,
      role: 'lawyer',
    },
  })

  return { user, personalId: personal.id, officeId: office.organization.id }
}

function tokenFor(userId: string, organizationId: string) {
  return app.jwt.sign({ sub: userId, org: organizationId })
}

describe('GET /organizations', () => {
  it('lista as duas organizações com o papel de cada uma', async () => {
    const { user, personalId, officeId } = await personWithTwoOrganizations()

    const res = await app.inject({
      method: 'GET',
      url: '/organizations',
      headers: { authorization: `Bearer ${tokenFor(user.id, personalId)}` },
    })

    expect(res.statusCode).toBe(200)

    const body = res.json().data as Array<{
      id: string
      role: string
      isCurrent: boolean
    }>

    expect(body).toHaveLength(2)
    expect(body.find((o) => o.id === personalId)).toMatchObject({
      role: 'owner',
      isCurrent: true,
    })
    expect(body.find((o) => o.id === officeId)).toMatchObject({
      role: 'lawyer',
      isCurrent: false,
    })
  })
})

describe('POST /auth/switch-organization', () => {
  it('reemite o token com a organização pedida', async () => {
    const { user, personalId, officeId } = await personWithTwoOrganizations()

    const res = await app.inject({
      method: 'POST',
      url: '/auth/switch-organization',
      headers: { authorization: `Bearer ${tokenFor(user.id, personalId)}` },
      payload: { organizationId: officeId },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      organizationId: officeId,
      role: 'lawyer',
    })
  })

  it('o token devolvido age na organização nova', async () => {
    const { user, personalId, officeId } = await personWithTwoOrganizations()

    const switched = await app.inject({
      method: 'POST',
      url: '/auth/switch-organization',
      headers: { authorization: `Bearer ${tokenFor(user.id, personalId)}` },
      payload: { organizationId: officeId },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/organizations',
      headers: {
        authorization: `Bearer ${switched.json().accessToken}`,
      },
    })

    const current = (
      res.json().data as Array<{ id: string; isCurrent: boolean }>
    ).find((o) => o.isCurrent)

    expect(current?.id).toBe(officeId)
  })

  it('nega organização em que não é membro', async () => {
    const { user, personalId } = await personWithTwoOrganizations()
    const stranger = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/auth/switch-organization',
      headers: { authorization: `Bearer ${tokenFor(user.id, personalId)}` },
      payload: { organizationId: stranger.organization.id },
    })

    expect(res.statusCode).toBe(403)
  })
})
