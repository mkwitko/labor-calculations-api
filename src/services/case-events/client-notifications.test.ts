import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { runClientDocumentReminders } from '@/services/reminders/client-document-reminders'
import {
  cleanDatabase,
  createTestCalculation,
  createTestUser,
} from '@/tests/helpers/db'

/**
 * Quatro dos cinco `NotificationType` existiam no enum e nunca eram emitidos.
 * Cada teste aqui prende um deles a um gatilho real.
 */
describe('client notifications', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  function authToken(userId: string) {
    return app.jwt.sign({ sub: userId })
  }

  async function caseWithClient() {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
      },
    })

    const caseRow = await systemPrisma.case.create({
      data: {
        organizationId: organization.id,
        assignedToId: user.id,
        clientId: client.id,
        title: 'Processo com cliente',
        phase: 'distribuido',
      },
    })

    return { user, organization, client, caseRow }
  }

  function notificationsOf(clientId: string) {
    return systemPrisma.clientNotification.findMany({ where: { clientId } })
  }

  it('emits hearing_scheduled when the lawyer schedules a hearing', async () => {
    const { user, client, caseRow } = await caseWithClient()

    const response = await app.inject({
      method: 'POST',
      url: `/cases/${caseRow.id}/hearings`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: {
        scheduledAt: new Date(
          Date.now() + 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        kind: 'conciliacao',
      },
    })

    expect(response.statusCode).toBe(201)

    const notifications = await notificationsOf(client.id)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('hearing_scheduled')
    expect(notifications[0].link).toBe(`/portal/casos/${caseRow.id}`)
  })

  it('emits timeline_event and a visible timeline entry on a phase change', async () => {
    const { user, client, caseRow } = await caseWithClient()

    const response = await app.inject({
      method: 'PATCH',
      url: `/cases/${caseRow.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { phase: 'execucao' },
    })

    expect(response.statusCode).toBe(200)

    const notifications = await notificationsOf(client.id)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('timeline_event')
    expect(notifications[0].message).toContain('Execução')

    const events = await systemPrisma.timelineEvent.findMany({
      where: { caseId: caseRow.id },
    })
    expect(events).toHaveLength(1)
    expect(events[0].isVisible).toBe(true)
  })

  it('does not notify when the case phase did not actually change', async () => {
    const { user, client, caseRow } = await caseWithClient()

    await app.inject({
      method: 'PATCH',
      url: `/cases/${caseRow.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { phase: 'distribuido', title: 'Outro título' },
    })

    expect(await notificationsOf(client.id)).toHaveLength(0)
  })

  it('emits settlement_received when a settlement is created', async () => {
    const { user, organization, client, caseRow } = await caseWithClient()

    const calculation = await createTestCalculation(user.id, organization.id, {
      clientId: client.id,
      caseId: caseRow.id,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/labor-calculation/${calculation.id}/settlements`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { agreementRate: 0.7, feeType: 'percentage', feeValue: 20 },
    })

    expect(response.statusCode).toBe(201)

    const notifications = await notificationsOf(client.id)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('settlement_received')
  })

  it('stays silent when the case has no client attached', async () => {
    const { user, organization } = await createTestUser()

    const caseRow = await systemPrisma.case.create({
      data: {
        organizationId: organization.id,
        assignedToId: user.id,
        title: 'Processo sem cliente',
        phase: 'distribuido',
      },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: `/cases/${caseRow.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { phase: 'execucao' },
    })

    expect(response.statusCode).toBe(200)
    expect(await systemPrisma.clientNotification.count()).toBe(0)
  })

  describe('document_due_soon reminder', () => {
    async function requirementDueIn(days: number) {
      const { organization, client, caseRow } = await caseWithClient()

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + days)
      dueDate.setHours(12, 0, 0, 0)

      await systemPrisma.documentRequirement.create({
        data: {
          organizationId: organization.id,
          caseId: caseRow.id,
          kind: 'ctps',
          description: 'Carteira de trabalho',
          status: 'pendente',
          dueDate,
        },
      })

      return { client }
    }

    it.each([
      3, 1,
    ])('notifies a pending document due in %i day(s)', async (days) => {
      const { client } = await requirementDueIn(days)

      await runClientDocumentReminders()

      const notifications = await notificationsOf(client.id)
      expect(notifications).toHaveLength(1)
      expect(notifications[0].type).toBe('document_due_soon')
    })

    it('ignores a document whose due date is outside the notice windows', async () => {
      const { client } = await requirementDueIn(5)

      await runClientDocumentReminders()

      expect(await notificationsOf(client.id)).toHaveLength(0)
    })

    it('ignores a document that was already delivered', async () => {
      const { organization, client, caseRow } = await caseWithClient()

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 3)
      dueDate.setHours(12, 0, 0, 0)

      await systemPrisma.documentRequirement.create({
        data: {
          organizationId: organization.id,
          caseId: caseRow.id,
          kind: 'ctps',
          description: 'Carteira de trabalho',
          status: 'aprovado',
          dueDate,
        },
      })

      await runClientDocumentReminders()

      expect(await notificationsOf(client.id)).toHaveLength(0)
    })
  })
})
