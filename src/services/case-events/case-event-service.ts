import type {
  ActivityKind,
  NotificationType,
  Prisma,
  TimelineEventType,
} from '@prisma/client'
import type { PrismaTransactionClient } from 'prisma/prisma'
import { requireOrganizationId } from '@/lib/tenant-context'
import { sendEmail } from '@/services/email'
import type { EmailContent } from '@/services/email/templates'

type Tx = PrismaTransactionClient

// Fire-and-forget email send with error logging (never blocks the request).
export async function sendEmailSafe(
  params: { to: string } & EmailContent,
  context: string,
): Promise<void> {
  await sendEmail(params).catch((err) => {
    console.error(`Failed to send email (${context})`, { error: err })
  })
}

// Single write point for a client-visible timeline event. Optionally records
// an internal Activity in the same transaction (audit log) — the two parallel
// logs were previously written by hand in each controller.
export async function recordTimelineEvent(
  tx: Tx,
  params: {
    caseId: string
    type: TimelineEventType
    title: string
    description?: string
    responsible?: string
    isVisible?: boolean
    activity?: {
      userId: string
      kind: ActivityKind
      payload?: Prisma.InputJsonValue
    }
  },
): Promise<void> {
  await tx.timelineEvent.create({
    data: {
      caseId: params.caseId,
      organizationId: requireOrganizationId(),
      type: params.type,
      title: params.title,
      description: params.description ?? null,
      date: new Date(),
      responsible: params.responsible ?? null,
      isVisible: params.isVisible ?? true,
    },
  })

  if (params.activity) {
    await tx.activity.create({
      data: {
        caseId: params.caseId,
        organizationId: requireOrganizationId(),
        userId: params.activity.userId,
        kind: params.activity.kind,
        payload: params.activity.payload ?? {},
      },
    })
  }
}

/**
 * Notifica o cliente do caso, quando existe um. A maior parte das rotas do
 * advogado só conhece o `caseId`; sem este atalho, cada uma teria que buscar o
 * cliente antes de decidir se notifica — e foi por isso que quatro dos cinco
 * `NotificationType` nunca chegaram a ser emitidos.
 *
 * Caso sem cliente vinculado é situação normal (o advogado abre o caso antes de
 * cadastrar a pessoa), então a ausência é silenciosa, não erro.
 */
export async function notifyCaseClient(
  tx: Tx,
  params: {
    caseId: string
    type: NotificationType
    title: string
    message: string
    link?: string
  },
): Promise<void> {
  const caseRow = await tx.case.findUnique({
    where: { id: params.caseId },
    select: { clientId: true },
  })

  if (!caseRow?.clientId) {
    return
  }

  await createClientNotification(tx, {
    clientId: caseRow.clientId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link ?? `/portal/casos/${params.caseId}`,
  })
}

// Creates a client-facing notification bell entry (inside the transaction).
// The e-mail is sent separately, after commit, via sendEmailSafe.
export async function createClientNotification(
  tx: Tx,
  params: {
    clientId: string
    type: NotificationType
    title: string
    message: string
    link?: string
  },
): Promise<void> {
  await tx.clientNotification.create({
    data: {
      clientId: params.clientId,
      organizationId: requireOrganizationId(),
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link ?? null,
    },
  })
}
