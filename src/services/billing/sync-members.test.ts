import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  countActiveMembers,
  syncMemberCount,
} from '@/services/billing/sync-members'
import { cleanDatabase, createMember, createTestUser } from '@/tests/helpers/db'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

async function seatsOf(organizationId: string) {
  const organization = await systemPrisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { seats: true },
  })

  return organization.seats
}

describe('countActiveMembers', () => {
  it('conta o titular e os membros', async () => {
    const { organization } = await createTestUser()
    await createMember(organization.id, 'lawyer')
    await createMember(organization.id, 'staff')

    expect(await countActiveMembers(organization.id)).toBe(3)
  })

  it('não conta quem foi removido', async () => {
    const { organization } = await createTestUser()
    const { membership } = await createMember(organization.id, 'lawyer')

    await systemPrisma.membership.update({
      where: { id: membership.id },
      data: { deletedAt: new Date() },
    })

    expect(await countActiveMembers(organization.id)).toBe(1)
  })
})

describe('syncMemberCount', () => {
  it('projeta a contagem em Organization.seats', async () => {
    const { organization } = await createTestUser()
    await createMember(organization.id, 'lawyer')

    expect(await syncMemberCount(organization.id)).toEqual({ seats: 2 })
    expect(await seatsOf(organization.id)).toBe(2)
  })

  it('converge quando chamada duas vezes: o valor é recalculado, não somado', async () => {
    const { organization } = await createTestUser()
    await createMember(organization.id, 'lawyer')

    await syncMemberCount(organization.id)
    await syncMemberCount(organization.id)

    expect(await seatsOf(organization.id)).toBe(2)
  })

  it('não lança para organização inexistente', async () => {
    // Aceitar convite não pode falhar por causa de um contador.
    expect(await syncMemberCount('org-que-nao-existe')).toEqual({ seats: 0 })
  })
})
