import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { onboardingStatusFor } from '@/services/onboarding/onboarding-status'
import {
  cleanDatabase,
  createTestCalculation,
  createTestUser,
} from '@/tests/helpers/db'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

describe('onboardingStatusFor', () => {
  it('starts with every step open and points at the client step', async () => {
    const { user, organization } = await createTestUser()

    const status = await onboardingStatusFor(user.id, organization.id)

    expect(status.completedCount).toBe(0)
    expect(status.totalCount).toBe(4)
    expect(status.allDone).toBe(false)
    expect(status.nextStep).toBe('client')
  })

  it('moves to the calculation step once a client exists', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.client.create({
      data: {
        name: 'Maria Silva',
        userId: user.id,
        organizationId: organization.id,
      },
    })

    const status = await onboardingStatusFor(user.id, organization.id)

    expect(status.hasClient).toBe(true)
    expect(status.nextStep).toBe('calculation')
  })

  it('ignores data from another organization', async () => {
    const { user, organization } = await createTestUser()
    const other = await createTestUser()
    await systemPrisma.client.create({
      data: {
        name: 'Cliente de outro escritório',
        userId: other.user.id,
        organizationId: other.organization.id,
      },
    })

    const status = await onboardingStatusFor(user.id, organization.id)

    expect(status.hasClient).toBe(false)
  })

  // O logotipo é da organização e só titular e sócio o gravam. Cobrar isso de
  // quem não pode fazer deixaria o passo aberto para sempre.
  it('requires logo and OAB from a role that manages branding', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.user.update({
      where: { id: user.id },
      data: { oabNumber: `SP/${Date.now()}` },
    })

    const status = await onboardingStatusFor(user.id, organization.id, 'admin')

    expect(status.profileComplete).toBe(false)
  })

  it('requires only the OAB from a role that cannot manage branding', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.user.update({
      where: { id: user.id },
      data: { oabNumber: `SP/${Date.now()}` },
    })

    const status = await onboardingStatusFor(user.id, organization.id, 'lawyer')

    expect(status.profileComplete).toBe(true)
  })

  it('reports allDone with no next step when the four steps are done', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: { logoUrl: 'https://cdn/logo.png' },
    })
    const client = await systemPrisma.client.create({
      data: { name: 'Maria', userId: user.id, organizationId: organization.id },
    })
    await systemPrisma.case.create({
      data: {
        title: 'Maria x Empresa',
        assignedToId: user.id,
        organizationId: organization.id,
        clientId: client.id,
      },
    })
    await createTestCalculation(user.id, organization.id, {
      clientId: client.id,
      clientName: 'Maria',
    })

    const status = await onboardingStatusFor(user.id, organization.id)

    expect(status.allDone).toBe(true)
    expect(status.completedCount).toBe(4)
    expect(status.nextStep).toBeNull()
  })
})
