import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { resolveActiveMembership } from './resolve-membership'

async function orgFor(userId: string, name: string, role: 'owner' | 'lawyer') {
  return systemPrisma.organization.create({
    data: {
      name,
      slug: `${name}-${Math.random().toString(36).slice(2)}`,
      memberships: { create: { userId, role } },
    },
  })
}

describe('resolveActiveMembership', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('devolve a organização pedida quando há membership viva', async () => {
    const { user, organization } = await createTestUser()

    const result = await resolveActiveMembership(user.id, organization.id)

    expect(result).toEqual({ organizationId: organization.id, role: 'owner' })
  })

  it('devolve null para organização de que não é membro', async () => {
    const { user } = await createTestUser()
    const outro = await createTestUser()

    expect(
      await resolveActiveMembership(user.id, outro.organization.id),
    ).toBeNull()
  })

  it('devolve null quando a membership foi removida', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.membership.updateMany({
      where: { userId: user.id, organizationId: organization.id },
      data: { deletedAt: new Date() },
    })

    expect(await resolveActiveMembership(user.id, organization.id)).toBeNull()
  })

  it('sem organização pedida, cai na membership mais antiga', async () => {
    const { user, organization } = await createTestUser()
    await new Promise((r) => setTimeout(r, 5))
    await orgFor(user.id, 'segunda', 'lawyer')

    const result = await resolveActiveMembership(user.id, undefined)

    expect(result?.organizationId).toBe(organization.id)
  })

  it('devolve null quando o usuário não tem nenhuma organização', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.membership.deleteMany({
      where: { userId: user.id, organizationId: organization.id },
    })

    expect(await resolveActiveMembership(user.id, undefined)).toBeNull()
  })
})
