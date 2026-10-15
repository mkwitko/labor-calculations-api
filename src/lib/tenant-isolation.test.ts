import { prisma, systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAsOrganization } from '@/lib/tenant-context'
import { TENANT_MODELS } from '@/lib/tenant-models'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

function calculationFields() {
  const money = '1000.00'

  return {
    clientName: 'Cliente',
    calculationVersion: 'v3',
    terminationType: 'sem_justa_causa' as const,
    startDate: new Date('2020-01-01'),
    endDate: new Date('2024-01-01'),
    lastSalary: money,
    baseSalary: money,
    unpaid13ths: 0,
    vacationCount: 0,
    priorNoticeWorked: false,
    extraHours: '0',
    nightHours: '0',
    insalubrityLevel: 0,
    dangerousWork: false,
    lastThreeSalariesAvg: money,
    priorNoticeValue: money,
    thirteenthSalaryValue: money,
    vacationValue: money,
    fgtsValue: money,
    fgtsFineValue: money,
    unemploymentInsuranceValue: money,
    extraHoursValue: money,
    nightAdditionalValue: money,
    insalubrityValue: money,
    dangerousWorkValue: money,
    totalValue: money,
  }
}

/**
 * Cria um registro de cada modelo tenant dentro de uma organização e devolve
 * o id de cada um. Os modelos com FK para Case, Client, LaborCalculation,
 * DocumentTemplate ou Settlement são criados depois dos pais.
 */
async function seedOneOfEach(organizationId: string, userId: string) {
  return runAsOrganization(organizationId, async () => {
    const client = await prisma.client.create({
      data: { organizationId, userId, name: 'Cliente' },
    })

    const kase = await prisma.case.create({
      data: {
        organizationId,
        assignedToId: userId,
        clientId: client.id,
        title: 'Caso',
      },
    })

    const calculation = await prisma.laborCalculation.create({
      data: { organizationId, userId, ...calculationFields() },
    })

    const template = await prisma.documentTemplate.create({
      data: { organizationId, name: 'Modelo' },
    })

    // Anexo de mensagem exige mensagem e documento já criados: `create`
    // aninhado obrigaria a forma `organization: { connect }` em cada nível.
    const attachedMessage = await prisma.message.create({
      data: {
        organizationId,
        caseId: kase.id,
        authorKind: 'lawyer',
        userId,
        body: 'Mensagem com anexo',
      },
    })

    // `ApiUsage` aponta para uma chave: as duas nascem antes do objeto, porque
    // `create` aninhado exigiria `organization: { connect }` em cada nível.
    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId,
        name: 'Integração',
        // O prefixo é único no banco; a organização entra na string para que
        // os dois seeds desta suíte não colidam.
        prefix: `jp_live_${organizationId.slice(-16)}`,
        secretHash: 'hash',
        createdById: userId,
      },
    })

    const attachedDocument = await prisma.document.create({
      data: {
        organizationId,
        caseId: kase.id,
        userId,
        kind: 'outros',
        // O fileKey carrega a organização porque os dois seeds da suíte rodam
        // no mesmo banco.
        fileKey: `k/anexo-${organizationId}.pdf`,
        fileName: 'anexo.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      },
    })

    // O anexo do suporte pendura numa fala, que pendura num chamado — os três
    // nascem antes do objeto pelo mesmo motivo dos anteriores.
    const supportTicket = await prisma.supportTicket.create({
      data: {
        organizationId,
        userId,
        kind: 'duvida',
        subject: 'Dúvida de uso',
      },
    })

    const supportMessage = await prisma.supportMessage.create({
      data: {
        organizationId,
        ticketId: supportTicket.id,
        userId,
        body: 'Primeira fala',
      },
    })

    const settlement = await prisma.settlement.create({
      data: {
        organizationId,
        laborCalculationId: calculation.id,
        agreementRate: '50.00',
        feeValue: '100.00',
        agreementValue: '500.00',
        feeAmount: '100.00',
        netToClient: '400.00',
        estimatedTime: '6 meses',
      },
    })

    return {
      Client: client,
      Case: kase,
      LaborCalculation: calculation,
      DocumentTemplate: template,
      Settlement: settlement,

      BatchAssessment: await prisma.batchAssessment.create({
        data: {
          organizationId,
          userId,
          name: 'Passivo da folha',
          engineVersion: 'v3',
        },
      }),

      DocumentTemplateVersion: await prisma.documentTemplateVersion.create({
        data: {
          organizationId,
          templateId: template.id,
          version: 1,
          fileKey: 'k/1.docx',
        },
      }),
      AgendaEvent: await prisma.agendaEvent.create({
        data: {
          organizationId,
          userId,
          title: 'Compromisso',
          startsAt: new Date(),
        },
      }),
      SettlementInstallment: await prisma.settlementInstallment.create({
        data: {
          organizationId,
          settlementId: settlement.id,
          number: 1,
          dueDate: new Date(),
          amount: '100.00',
        },
      }),
      DocumentRequirement: await prisma.documentRequirement.create({
        data: {
          organizationId,
          caseId: kase.id,
          kind: 'ctps',
          description: 'CTPS',
        },
      }),
      Deadline: await prisma.deadline.create({
        data: {
          organizationId,
          caseId: kase.id,
          dueAt: new Date(),
          kind: 'contestacao',
        },
      }),
      Hearing: await prisma.hearing.create({
        data: {
          organizationId,
          caseId: kase.id,
          scheduledAt: new Date(),
          kind: 'inicial',
        },
      }),
      Document: await prisma.document.create({
        data: {
          organizationId,
          caseId: kase.id,
          userId,
          kind: 'ctps',
          fileKey: 'k/doc.pdf',
          fileName: 'doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
        },
      }),
      Note: await prisma.note.create({
        data: { organizationId, caseId: kase.id, userId, body: 'Anotação' },
      }),
      ClientNotification: await prisma.clientNotification.create({
        data: {
          organizationId,
          clientId: client.id,
          type: 'timeline_event',
          title: 'Aviso',
          message: 'Mensagem',
        },
      }),
      ClientAccessToken: await prisma.clientAccessToken.create({
        data: {
          organizationId,
          clientId: client.id,
          // O hash é único no banco; a organização entra na string para que os
          // dois seeds desta suíte não colidam.
          tokenHash: `hash-${organizationId}`,
          purpose: 'invite',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
      CaseTask: await prisma.caseTask.create({
        data: { organizationId, caseId: kase.id, title: 'Tarefa' },
      }),
      CaseParty: await prisma.caseParty.create({
        data: {
          organizationId,
          caseId: kase.id,
          role: 'reclamante',
          name: 'Parte',
        },
      }),
      CaseMovement: await prisma.caseMovement.create({
        data: {
          organizationId,
          caseId: kase.id,
          date: new Date(),
          description: 'Movimento',
        },
      }),
      TimelineEvent: await prisma.timelineEvent.create({
        data: {
          organizationId,
          caseId: kase.id,
          type: 'processo_iniciado',
          title: 'Início',
          date: new Date(),
        },
      }),
      Activity: await prisma.activity.create({
        data: {
          organizationId,
          caseId: kase.id,
          userId,
          kind: 'case_created',
        },
      }),
      FeeAgreement: await prisma.feeAgreement.create({
        data: { organizationId, caseId: kase.id },
      }),
      AuditLog: await prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entityType: 'LaborCalculation',
          entityId: calculation.id,
          action: 'create',
        },
      }),
      Message: await prisma.message.create({
        data: {
          organizationId,
          caseId: kase.id,
          authorKind: 'lawyer',
          userId,
          body: 'Mensagem',
        },
      }),
      MessageAttachment: await prisma.messageAttachment.create({
        data: {
          organizationId,
          messageId: attachedMessage.id,
          documentId: attachedDocument.id,
        },
      }),
      ApiKey: apiKey,
      ApiUsage: await prisma.apiUsage.create({
        data: {
          organizationId,
          apiKeyId: apiKey.id,
          endpoint: 'POST /v1/calculations/liquidacao',
        },
      }),
      SupportTicket: supportTicket,
      SupportMessage: supportMessage,
      SupportAttachment: await prisma.supportAttachment.create({
        data: {
          organizationId,
          messageId: supportMessage.id,
          fileKey: `support/${organizationId}/print.png`,
          fileName: 'print.png',
          mimeType: 'image/png',
          sizeBytes: 1_024,
        },
      }),
    }
  })
}

type Delegate = {
  findUnique: (args: unknown) => Promise<unknown>
  findFirst: (args: unknown) => Promise<unknown>
  findMany: (args?: unknown) => Promise<unknown[]>
  count: (args: unknown) => Promise<number>
  updateMany: (args: unknown) => Promise<{ count: number }>
  deleteMany: (args: unknown) => Promise<{ count: number }>
}

function delegateFor(model: string): Delegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1)

  return (prisma as unknown as Record<string, Delegate>)[key]
}

describe('isolamento entre organizações', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('cria um registro de cada modelo tenant', async () => {
    const { user, organization } = await createTestUser()
    const created = await seedOneOfEach(organization.id, user.id)

    expect([...TENANT_MODELS].filter((m) => !(m in created))).toEqual([])
  })

  it('não deixa a organização B alcançar registros da organização A', async () => {
    const a = await createTestUser()
    const b = await createTestUser()
    const created = await seedOneOfEach(a.organization.id, a.user.id)

    await runAsOrganization(b.organization.id, async () => {
      for (const model of TENANT_MODELS) {
        const { id } = created[model as keyof typeof created]
        const delegate = delegateFor(model)

        expect(await delegate.findUnique({ where: { id } })).toBeNull()
        expect(await delegate.findFirst({ where: { id } })).toBeNull()
        expect(await delegate.findMany({ where: { id } })).toEqual([])
        expect(await delegate.count({ where: { id } })).toBe(0)
        expect(
          (await delegate.updateMany({ where: { id }, data: {} })).count,
        ).toBe(0)
        expect((await delegate.deleteMany({ where: { id } })).count).toBe(0)
      }
    })
  })

  it('deixa os registros de A intactos depois das tentativas de B', async () => {
    const a = await createTestUser()
    const b = await createTestUser()
    const created = await seedOneOfEach(a.organization.id, a.user.id)

    await runAsOrganization(b.organization.id, async () => {
      for (const model of TENANT_MODELS) {
        const { id } = created[model as keyof typeof created]
        await delegateFor(model).deleteMany({ where: { id } })
      }
    })

    await runAsOrganization(a.organization.id, async () => {
      for (const model of TENANT_MODELS) {
        const { id } = created[model as keyof typeof created]

        expect(
          await delegateFor(model).findUnique({ where: { id } }),
        ).not.toBeNull()
      }
    })
  })

  it('recusa modelo tenant sem contexto de organização', async () => {
    await expect(prisma.case.findMany()).rejects.toThrow(
      /sem contexto de organização/,
    )
  })

  it('permite modelo não-tenant sem contexto', async () => {
    await expect(systemPrisma.user.findMany()).resolves.toBeInstanceOf(Array)
  })
})
