import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sendOnboardingNudges } from '@/services/onboarding/send-onboarding-nudges'
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

/** Coletor no lugar do Resend: a porta é injetada, nunca mockada por módulo. */
function collector() {
  const sent: Array<{ to: string; subject: string }> = []
  return {
    sent,
    port: async (p: { to: string; subject: string; html: string }) => {
      sent.push({ to: p.to, subject: p.subject })
    },
  }
}

/** Envelhece o createdAt do usuário para cair na janela de um nudge. */
async function ageAccount(userId: string, days: number) {
  const at = new Date()
  at.setDate(at.getDate() - days)
  await systemPrisma.user.update({
    where: { id: userId },
    data: { createdAt: at },
  })
}

describe('sendOnboardingNudges', () => {
  it('sends the D+1 nudge to an account created yesterday with an open checklist', async () => {
    const { user } = await createTestUser()
    await ageAccount(user.id, 1)
    const mail = collector()

    const result = await sendOnboardingNudges(mail.port)

    expect(result.d1).toBe(1)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].to).toBe(user.mail)
    expect(mail.sent[0].subject).toContain('3 minutos')
  })

  it('does not send twice for the same account', async () => {
    const { user } = await createTestUser()
    await ageAccount(user.id, 1)
    const first = collector()
    await sendOnboardingNudges(first.port)

    const second = collector()
    const result = await sendOnboardingNudges(second.port)

    expect(result.d1).toBe(0)
    expect(second.sent).toHaveLength(0)
  })

  it('sends the D+3 nudge on day three', async () => {
    const { user } = await createTestUser()
    await ageAccount(user.id, 3)
    const mail = collector()

    const result = await sendOnboardingNudges(mail.port)

    // A conta atravessou a janela do D+1 sem receber nada, então esta execução
    // marca o D+1 como resolvido e manda só o D+3.
    expect(result.d3).toBe(1)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].subject).toContain('costuma ajudar')
  })

  it('marks the nudge as handled without sending when the checklist is done', async () => {
    const { user, organization } = await createTestUser()
    await ageAccount(user.id, 1)
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
    const mail = collector()

    const result = await sendOnboardingNudges(mail.port)

    expect(mail.sent).toHaveLength(0)
    expect(result.skipped).toBe(1)
    const after = await systemPrisma.user.findUnique({
      where: { id: user.id },
      select: { onbNudgeD1SentAt: true },
    })
    expect(after?.onbNudgeD1SentAt).not.toBeNull()
  })

  it('sends nothing to an account that opted out', async () => {
    const { user } = await createTestUser()
    await ageAccount(user.id, 1)
    await systemPrisma.user.update({
      where: { id: user.id },
      data: { onbNudgeOptOut: true },
    })
    const mail = collector()

    const result = await sendOnboardingNudges(mail.port)

    expect(mail.sent).toHaveLength(0)
    expect(result.d1).toBe(0)
  })

  it('sends nothing to an account outside both windows', async () => {
    const { user } = await createTestUser()
    await ageAccount(user.id, 9)
    const mail = collector()

    const result = await sendOnboardingNudges(mail.port)

    expect(mail.sent).toHaveLength(0)
    expect(result).toMatchObject({ d1: 0, d3: 0 })
  })
})
