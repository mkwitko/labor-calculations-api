import type { Prisma } from '@prisma/client'
import { prisma } from 'prisma/prisma'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { requireOrganizationId } from '@/lib/tenant-context'
import type { TenantActor } from '@/services/tenant/actor'
import { caseVisibility } from '@/services/tenant/visibility'
import { publish, subscriberCount } from './broker'

export type MessageAuthor =
  | { kind: 'lawyer'; userId: string }
  | { kind: 'client'; clientId: string }

export type Viewer = 'lawyer' | 'client'

export type MessageAttachmentView = {
  documentId: string
  /** O app do advogado abre por aqui (`VITE_STORAGE_URL/${fileKey}`); o portal
   * usa a rota de download assinada, por `documentId`. */
  fileKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

export type MessageView = {
  id: string
  authorKind: Viewer
  authorName: string
  body: string
  createdAt: string
  attachments: MessageAttachmentView[]
}

/** O que a listagem e a criação precisam ler para montar `MessageView`. */
export const MESSAGE_SELECT = {
  id: true,
  authorKind: true,
  body: true,
  createdAt: true,
  user: { select: { name: true } },
  client: { select: { name: true } },
  attachments: {
    select: {
      document: {
        select: {
          id: true,
          fileKey: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  },
} as const

type MessageRow = {
  id: string
  authorKind: Viewer
  body: string
  createdAt: Date
  user: { name: string } | null
  client: { name: string } | null
  attachments: Array<{
    document: {
      id: string
      fileKey: string
      fileName: string
      mimeType: string
      sizeBytes: number
    }
  }>
}

/**
 * O nome do autor depende de quem lê: cada lado vê "Você" no que escreveu. É a
 * mesma convenção que o portal usava nas notas.
 */
export function toMessageView(row: MessageRow, viewer: Viewer): MessageView {
  const mine = row.authorKind === viewer
  const authorName = mine
    ? 'Você'
    : row.authorKind === 'lawyer'
      ? (row.user?.name ?? 'Escritório')
      : (row.client?.name ?? 'Cliente')

  return {
    id: row.id,
    authorKind: row.authorKind,
    authorName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    attachments: row.attachments.map((a) => ({
      documentId: a.document.id,
      fileKey: a.document.fileKey,
      fileName: a.document.fileName,
      mimeType: a.document.mimeType,
      sizeBytes: a.document.sizeBytes,
    })),
  }
}

export async function createMessage(input: {
  caseId: string
  author: MessageAuthor
  body: string
  attachmentDocumentIds?: string[]
}): Promise<{ id: string }> {
  const body = input.body.trim()
  const documentIds = input.attachmentDocumentIds ?? []

  if (!body && documentIds.length === 0) {
    throw new BadRequestException('Mensagem vazia')
  }

  if (documentIds.length > 0) {
    // Documento de outro caso, apagado, ou já preso a outra mensagem não serve.
    // O `@unique` em `MessageAttachment.documentId` fecha a corrida; esta
    // consulta é o que dá a mensagem de erro decente.
    const usable = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        caseId: input.caseId,
        deletedAt: null,
        messageAttachment: null,
      },
      select: { id: true },
    })

    if (usable.length !== documentIds.length) {
      throw new BadRequestException('Anexo inválido')
    }
  }

  const now = new Date()
  const organizationId = requireOrganizationId()

  const message = await prisma.message.create({
    data: {
      caseId: input.caseId,
      organizationId,
      body,
      authorKind: input.author.kind,
      userId: input.author.kind === 'lawyer' ? input.author.userId : null,
      clientId: input.author.kind === 'client' ? input.author.clientId : null,
      // Quem escreve já leu. Sem isso a própria mensagem entraria na contagem
      // de não lidas do autor.
      readByLawyerAt: input.author.kind === 'lawyer' ? now : null,
      readByClientAt: input.author.kind === 'client' ? now : null,
      attachments: {
        create: documentIds.map((documentId) => ({
          documentId,
          organizationId,
        })),
      },
    },
    select: { id: true },
  })

  const row = await prisma.message.findUniqueOrThrow({
    where: { id: message.id },
    select: MESSAGE_SELECT,
  })

  // Publica para os dois lados: o autor recebe de volta a versão canônica e o
  // destinatário recebe a dele, com o nome do autor pela lente certa.
  for (const viewer of ['lawyer', 'client'] as const) {
    publish(
      { organizationId, caseId: input.caseId, viewer },
      {
        type: 'message',
        caseId: input.caseId,
        message: toMessageView(row, viewer),
      },
    )
  }

  if (input.author.kind === 'lawyer') {
    const clientOnline =
      subscriberCount({
        organizationId,
        caseId: input.caseId,
        viewer: 'client',
      }) > 0

    // Com o portal aberto, a mensagem já chegou pelo stream; o sino viraria
    // ruído.
    if (!clientOnline) {
      await notifyClient({ caseId: input.caseId, body })
    }
  }

  return message
}

/**
 * Sino do portal. Best-effort: falha aqui não pode derrubar o envio, que já
 * está gravado.
 */
async function notifyClient(input: {
  caseId: string
  body: string
}): Promise<void> {
  try {
    const kase = await prisma.case.findFirst({
      where: { id: input.caseId },
      select: { clientId: true },
    })

    if (!kase?.clientId) return

    await prisma.clientNotification.create({
      data: {
        clientId: kase.clientId,
        organizationId: requireOrganizationId(),
        type: 'message_received',
        title: 'Nova mensagem do escritório',
        message: input.body ? input.body.slice(0, 120) : 'Enviou um documento',
        link: `/portal/casos/${input.caseId}`,
      },
    })
  } catch (error) {
    console.error('Falha ao notificar cliente de nova mensagem', error)
  }
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

export async function listMessages(input: {
  caseId: string
  viewer: Viewer
  cursor?: string
  limit?: number
}): Promise<{ items: MessageView[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)

  const rows = await prisma.message.findMany({
    where: { caseId: input.caseId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: MESSAGE_SELECT,
  })

  const page = rows.slice(0, limit)

  return {
    items: page.map((row) => toMessageView(row, input.viewer)),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  }
}

export async function markMessagesRead(input: {
  caseId: string
  viewer: Viewer
}): Promise<{ updated: number }> {
  const field = input.viewer === 'lawyer' ? 'readByLawyerAt' : 'readByClientAt'
  const otherSide: Viewer = input.viewer === 'lawyer' ? 'client' : 'lawyer'

  const result = await prisma.message.updateMany({
    where: {
      caseId: input.caseId,
      deletedAt: null,
      authorKind: otherSide,
      [field]: null,
    },
    data: { [field]: new Date() },
  })

  if (result.count > 0) {
    publish(
      {
        organizationId: requireOrganizationId(),
        caseId: input.caseId,
        viewer: otherSide,
      },
      {
        type: 'read',
        caseId: input.caseId,
        viewer: input.viewer,
        at: new Date().toISOString(),
      },
    )
  }

  return { updated: result.count }
}

async function groupUnread(where: Prisma.MessageWhereInput): Promise<{
  total: number
  byCase: Array<{ caseId: string; count: number }>
}> {
  const groups = await prisma.message.groupBy({
    by: ['caseId'],
    where,
    _count: { _all: true },
  })

  const byCase = groups.map((g) => ({ caseId: g.caseId, count: g._count._all }))

  return { total: byCase.reduce((sum, g) => sum + g.count, 0), byCase }
}

/** Não lidas do escritório, já pela lente do papel de quem pergunta. */
export async function unreadCountForLawyer(actor: TenantActor) {
  return groupUnread({
    deletedAt: null,
    authorKind: 'client',
    readByLawyerAt: null,
    case: { ...caseVisibility(actor), deletedAt: null },
  })
}

export async function unreadCountForClient(clientId: string) {
  return groupUnread({
    deletedAt: null,
    authorKind: 'lawyer',
    readByClientAt: null,
    case: { clientId, deletedAt: null },
  })
}
