import { systemPrisma as prisma } from 'prisma/prisma'
import { formatDatePtBr } from '@/utils/format-ptbr'

/**
 * Dias de antecedência do aviso. Uma janela de um dia por vez mantém o job
 * idempotente sem tabela de controle: só entra o requisito cujo vencimento cai
 * exatamente naquele dia, então o cron diário nunca avisa duas vezes o mesmo.
 */
const NOTICE_DAYS = [3, 1]

function dayWindow(daysFromNow: number): { start: Date; end: Date } {
  const start = new Date()
  start.setDate(start.getDate() + daysFromNow)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

/**
 * Avisa o cliente sobre documento pendente perto do prazo. Roda em contexto de
 * sistema (cron), então usa `systemPrisma` e grava `organizationId` explícito —
 * a extension de tenant não injeta nada aqui.
 */
export async function runClientDocumentReminders(): Promise<number> {
  let created = 0

  for (const days of NOTICE_DAYS) {
    const { start, end } = dayWindow(days)

    const requirements = await prisma.documentRequirement.findMany({
      where: {
        status: 'pendente',
        dueDate: { gte: start, lte: end },
        case: { deletedAt: null, clientId: { not: null } },
      },
      select: {
        id: true,
        description: true,
        dueDate: true,
        organizationId: true,
        caseId: true,
        case: { select: { clientId: true } },
      },
    })

    for (const requirement of requirements) {
      const clientId = requirement.case.clientId
      if (!clientId || !requirement.dueDate) continue

      await prisma.clientNotification.create({
        data: {
          clientId,
          organizationId: requirement.organizationId,
          type: 'document_due_soon',
          title:
            days === 1
              ? 'Documento vence amanhã'
              : `Documento vence em ${days} dias`,
          message: `${requirement.description} — prazo em ${formatDatePtBr(
            requirement.dueDate,
          )}.`,
          link: `/portal/casos/${requirement.caseId}`,
        },
      })

      created += 1
    }
  }

  console.log('Client document reminders sent', {
    created,
    timestamp: new Date().toISOString(),
  })

  return created
}
