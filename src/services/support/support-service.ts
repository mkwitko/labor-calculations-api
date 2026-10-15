import type { Prisma, SupportKind, SupportStatus } from '@prisma/client'
import { prisma, systemPrisma } from 'prisma/prisma'
import { env } from '@/env'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { requireOrganizationId } from '@/lib/tenant-context'
import { sendEmail } from '@/services/email'
import { priorityPlanCodes } from './priority-support'
import {
  type AttachmentInput,
  assertAttachmentsAllowed,
  scanAttachment,
  withDownloadUrls,
} from './support-attachment'

/**
 * Suporte e sugestões.
 *
 * Duas regras moldam tudo aqui:
 *
 * 1. **O chamado é do escritório.** Quem abriu pode sair da organização no meio
 *    da conversa; os colegas continuam vendo e respondendo. Por isso a leitura
 *    passa pelo `prisma` com escopo de tenant, e não por `userId`.
 * 2. **O atendimento atravessa organizações.** As funções de staff usam
 *    `systemPrisma` de propósito — é o dono do produto olhando a fila inteira —,
 *    e quem as protege é o `requireAdmin` na rota.
 */

/** Para onde vai o aviso de chamado novo. */
const SUPPORT_INBOX = env.SUPPORT_EMAIL

/** Quanto texto cabe numa fala. Acima disso, anexo. */
export const MAX_BODY_LENGTH = 5_000

/** Campos do anexo que a tela recebe — a chave do R2 nunca sai daqui. */
const attachmentSelect = {
  id: true,
  fileKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  scanStatus: true,
} as const

/**
 * Grava os anexos de uma fala e dispara a varredura sem esperar por ela.
 *
 * Esperar o clamd deixaria a mensagem presa atrás de um download de 25MB; quem
 * lê antes do veredito vê `scanStatus: pending`, e o download só é negado se a
 * varredura de fato acusar.
 */
async function attachToMessage(
  client: typeof prisma | typeof systemPrisma,
  input: {
    messageId: string
    organizationId: string
    attachments?: AttachmentInput[]
  },
): Promise<void> {
  const attachments = input.attachments ?? []

  if (attachments.length === 0) return

  const created = await Promise.all(
    attachments.map((attachment) =>
      client.supportAttachment.create({
        data: {
          messageId: input.messageId,
          organizationId: input.organizationId,
          fileKey: attachment.fileKey,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        },
        select: { id: true },
      }),
    ),
  )

  for (const attachment of created) {
    void scanAttachment(attachment.id)
  }
}

export type TicketContext = {
  /** Rota de onde o chamado saiu — evita perguntar "em que tela foi?". */
  path?: string
  appVersion?: string
  userAgent?: string
}

function preview(body: string, max = 140): string {
  const clean = body.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function bodyToHtml(body: string): string {
  return escapeHtml(body).replace(/\n/g, '<br/>')
}

const KIND_LABELS: Record<SupportKind, string> = {
  duvida: 'Dúvida',
  problema: 'Problema',
  sugestao: 'Sugestão',
}

/**
 * O mesmo status tem nome diferente nos dois fluxos: `concluido` é "resolvido"
 * num chamado e "entregue" numa sugestão. A tradução mora aqui porque o e-mail
 * também precisa dela — deixá-la só no front faria o aviso dizer uma coisa e a
 * tela outra.
 */
export function statusLabel(status: SupportStatus, kind: SupportKind): string {
  const suggestion = kind === 'sugestao'

  switch (status) {
    case 'aberto':
      return suggestion ? 'Recebida' : 'Aberto'
    case 'em_analise':
      return 'Em análise'
    case 'aguardando_usuario':
      return 'Aguardando você'
    case 'planejado':
      return 'Planejada'
    case 'em_desenvolvimento':
      return 'Em desenvolvimento'
    case 'concluido':
      return suggestion ? 'Entregue' : 'Resolvido'
    case 'recusado':
      return suggestion ? 'Não vamos fazer' : 'Encerrado'
  }
}

/** Status em que o assunto ainda está vivo para quem abriu. */
const OPEN_STATUSES: SupportStatus[] = [
  'aberto',
  'em_analise',
  'aguardando_usuario',
  'planejado',
  'em_desenvolvimento',
]

const CLOSED_STATUSES: SupportStatus[] = ['concluido', 'recusado']

function isClosed(status: SupportStatus): boolean {
  return CLOSED_STATUSES.includes(status)
}

// ---------------------------------------------------------------------------
// Escritório
// ---------------------------------------------------------------------------

export async function createTicket(input: {
  userId: string
  kind: SupportKind
  subject: string
  body: string
  context?: TicketContext
  attachments?: AttachmentInput[]
}) {
  const body = input.body.trim()

  if (!body) throw new BadRequestException('Escreva a sua mensagem.')

  assertAttachmentsAllowed(input.attachments)

  const organizationId = requireOrganizationId()

  const ticket = await prisma.supportTicket.create({
    data: {
      kind: input.kind,
      subject: input.subject.trim(),
      userId: input.userId,
      // A extension injeta em tempo de execução, mas o tipo do Prisma continua
      // exigindo o campo — mesma escrita explícita do resto dos serviços.
      organizationId,
      context: (input.context ?? {}) as Prisma.InputJsonValue,
      messages: {
        create: {
          body,
          userId: input.userId,
          organizationId,
          // Quem abriu já leu o que escreveu; o atendimento ainda não.
          readByUserAt: new Date(),
        },
      },
    },
    select: {
      id: true,
      kind: true,
      subject: true,
      status: true,
      messages: { select: { id: true } },
    },
  })

  await attachToMessage(prisma, {
    messageId: ticket.messages[0].id,
    organizationId,
    attachments: input.attachments,
  })

  // O aviso é best-effort: chamado gravado sem e-mail enviado ainda aparece na
  // fila do atendimento. Falhar a requisição aqui perderia o texto que a pessoa
  // acabou de escrever.
  await notifyStaffNewTicket({
    ticketId: ticket.id,
    kind: input.kind,
    subject: ticket.subject,
    body,
    organizationId,
    attachments: input.attachments?.length ?? 0,
  })

  return ticket
}

export async function listTickets(filter?: { open?: boolean }) {
  return prisma.supportTicket.findMany({
    where: filter?.open ? { status: { in: OPEN_STATUSES } } : undefined,
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true,
      kind: true,
      status: true,
      subject: true,
      createdAt: true,
      lastMessageAt: true,
      user: { select: { id: true, name: true } },
      _count: { select: { messages: { where: { readByUserAt: null } } } },
    },
  })
}

export async function getTicket(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      kind: true,
      status: true,
      subject: true,
      createdAt: true,
      closedAt: true,
      user: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          fromStaff: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          attachments: { select: attachmentSelect },
        },
      },
    },
  })

  if (!ticket) throw new ResourceNotFoundException('Chamado não encontrado')

  // Abrir o chamado é o que marca como lido — não existe outra tela onde a
  // resposta do atendimento apareça.
  await prisma.supportMessage.updateMany({
    where: { ticketId, fromStaff: true, readByUserAt: null },
    data: { readByUserAt: new Date() },
  })

  return { ...ticket, messages: await withMessageUrls(ticket.messages) }
}

/** Assina as URLs de leitura de cada fala. Vale para as duas telas. */
async function withMessageUrls<
  T extends {
    attachments: {
      id: string
      fileKey: string
      fileName: string
      mimeType: string
      sizeBytes: number
      scanStatus: 'pending' | 'clean' | 'infected' | 'skipped'
    }[]
  },
>(messages: T[]) {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      attachments: await withDownloadUrls(message.attachments),
    })),
  )
}

export async function replyAsUser(input: {
  ticketId: string
  userId: string
  body: string
  attachments?: AttachmentInput[]
}) {
  const body = input.body.trim()

  if (!body) throw new BadRequestException('Escreva a sua mensagem.')

  assertAttachmentsAllowed(input.attachments)

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, kind: true, subject: true, status: true },
  })

  if (!ticket) throw new ResourceNotFoundException('Chamado não encontrado')

  const organizationId = requireOrganizationId()

  const message = await prisma.supportMessage.create({
    data: {
      ticketId: ticket.id,
      body,
      userId: input.userId,
      organizationId,
      readByUserAt: new Date(),
    },
    select: { id: true },
  })

  await attachToMessage(prisma, {
    messageId: message.id,
    organizationId,
    attachments: input.attachments,
  })

  // Responder reabre: assunto que voltou não é assunto resolvido, e deixá-lo
  // fechado esconderia a resposta no fim de uma fila que ninguém olha.
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      lastMessageAt: new Date(),
      status: isClosed(ticket.status) ? 'aberto' : ticket.status,
      closedAt: isClosed(ticket.status) ? null : undefined,
    },
  })

  await notifyStaffReply({
    ticketId: ticket.id,
    kind: ticket.kind,
    subject: ticket.subject,
    body,
    organizationId,
    attachments: input.attachments?.length ?? 0,
  })

  return { id: ticket.id }
}

/** Quem abriu pode encerrar o próprio assunto. */
export async function closeTicket(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  })

  if (!ticket) throw new ResourceNotFoundException('Chamado não encontrado')

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: 'concluido', closedAt: new Date() },
  })

  return { id: ticketId }
}

/** Quantas respostas do atendimento ainda não foram lidas. Alimenta o badge. */
export async function countUnreadForOrganization(): Promise<number> {
  return prisma.supportMessage.count({
    where: { fromStaff: true, readByUserAt: null },
  })
}

// ---------------------------------------------------------------------------
// Atendimento (dono do produto) — atravessa organizações, por isso systemPrisma
// ---------------------------------------------------------------------------

export async function listTicketsForStaff(filter?: {
  status?: SupportStatus
  kind?: SupportKind
  onlyOpen?: boolean
}) {
  const where: Prisma.SupportTicketWhereInput = {}

  if (filter?.status) where.status = filter.status
  else if (filter?.onlyOpen) where.status = { in: OPEN_STATUSES }

  if (filter?.kind) where.kind = filter.kind

  const tickets = await systemPrisma.supportTicket.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
    select: {
      id: true,
      kind: true,
      status: true,
      subject: true,
      createdAt: true,
      lastMessageAt: true,
      user: { select: { id: true, name: true, mail: true } },
      organization: { select: { id: true, name: true, planCode: true } },
      _count: { select: { messages: { where: { readByStaffAt: null } } } },
    },
  })

  const priority = await priorityPlanCodes()

  // A ordenação final é em memória porque prioridade não é coluna: mora no
  // plano, e o plano mora no Stripe. São 200 linhas — ordenar aqui custa menos
  // que denormalizar um dado que muda a cada troca de assinatura.
  return tickets
    .map((ticket) => ({
      ...ticket,
      priority: priority.has(ticket.organization.planCode),
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1
      return b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    })
}

export async function getTicketForStaff(ticketId: string) {
  const ticket = await systemPrisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      kind: true,
      status: true,
      subject: true,
      context: true,
      createdAt: true,
      closedAt: true,
      user: { select: { id: true, name: true, mail: true } },
      organization: { select: { id: true, name: true, planCode: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          fromStaff: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          attachments: { select: attachmentSelect },
        },
      },
    },
  })

  if (!ticket) throw new ResourceNotFoundException('Chamado não encontrado')

  await systemPrisma.supportMessage.updateMany({
    where: { ticketId, fromStaff: false, readByStaffAt: null },
    data: { readByStaffAt: new Date() },
  })

  const priority = await priorityPlanCodes()

  return {
    ...ticket,
    priority: priority.has(ticket.organization.planCode),
    messages: await withMessageUrls(ticket.messages),
  }
}

/** De qual escritório é o chamado — o anexo do atendimento é gravado sob ele. */
export async function getTicketOrganization(ticketId: string) {
  const ticket = await systemPrisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, organizationId: true },
  })

  if (!ticket) throw new ResourceNotFoundException('Chamado não encontrado')

  return ticket
}

export async function replyAsStaff(input: {
  ticketId: string
  body: string
  /** Muda o status junto com a resposta, quando o atendimento quiser. */
  status?: SupportStatus
  attachments?: AttachmentInput[]
}) {
  const body = input.body.trim()

  if (!body) throw new BadRequestException('Escreva a resposta.')

  assertAttachmentsAllowed(input.attachments)

  const ticket = await systemPrisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true,
      kind: true,
      subject: true,
      status: true,
      organizationId: true,
      user: { select: { mail: true, name: true } },
    },
  })

  if (!ticket) throw new ResourceNotFoundException('Chamado não encontrado')

  const message = await systemPrisma.supportMessage.create({
    data: {
      ticketId: ticket.id,
      body,
      fromStaff: true,
      organizationId: ticket.organizationId,
      readByStaffAt: new Date(),
    },
    select: { id: true },
  })

  await attachToMessage(systemPrisma, {
    messageId: message.id,
    organizationId: ticket.organizationId,
    attachments: input.attachments,
  })

  // Sem status explícito, responder um chamado o coloca em "aguardando você":
  // a bola está com quem abriu. Sugestão não muda de estágio só porque foi
  // comentada — ela anda quando o desenvolvimento anda.
  const nextStatus =
    input.status ??
    (ticket.kind === 'sugestao' ? ticket.status : 'aguardando_usuario')

  await systemPrisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: nextStatus,
      lastMessageAt: new Date(),
      closedAt: isClosed(nextStatus) ? new Date() : null,
    },
  })

  if (ticket.user?.mail) {
    await notifyUserReply({
      mail: ticket.user.mail,
      name: ticket.user.name,
      subject: ticket.subject,
      kind: ticket.kind,
      body,
      status: nextStatus,
      ticketId: ticket.id,
    })
  }

  return { id: ticket.id, status: nextStatus }
}

export async function updateTicketStatus(input: {
  ticketId: string
  status: SupportStatus
}) {
  const ticket = await systemPrisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true,
      kind: true,
      subject: true,
      status: true,
      user: { select: { mail: true, name: true } },
    },
  })

  if (!ticket) throw new ResourceNotFoundException('Chamado não encontrado')

  if (ticket.status === input.status) return { id: ticket.id }

  await systemPrisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: input.status,
      closedAt: isClosed(input.status) ? new Date() : null,
    },
  })

  // O aviso de mudança de estágio é o que faz "sugestão privada com status"
  // valer alguma coisa: sem ele, ninguém volta à tela para descobrir.
  if (ticket.user?.mail) {
    await notifyUserStatus({
      mail: ticket.user.mail,
      name: ticket.user.name,
      subject: ticket.subject,
      kind: ticket.kind,
      status: input.status,
      ticketId: ticket.id,
    })
  }

  return { id: ticket.id }
}

/** Fila do atendimento: o que está aberto e o que ainda não foi lido. */
export async function staffInboxSummary() {
  const [open, unreadTickets] = await Promise.all([
    systemPrisma.supportTicket.count({
      where: { status: { in: OPEN_STATUSES } },
    }),
    systemPrisma.supportTicket.count({
      where: { messages: { some: { fromStaff: false, readByStaffAt: null } } },
    }),
  ])

  return { open, unread: unreadTickets }
}

// ---------------------------------------------------------------------------
// E-mails
// ---------------------------------------------------------------------------

function ticketUrl(ticketId: string, staff = false): string {
  const base = env.CLIENT_URL.replace(/\/$/, '')
  return staff
    ? `${base}/admin/suporte?ticket=${ticketId}`
    : `${base}/suporte/${ticketId}`
}

async function safeSend(params: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  try {
    await sendEmail(params)
  } catch (err) {
    // Aviso é acessório: o chamado já está gravado e aparece nas duas telas.
    console.error('Support email failed', { to: params.to, error: err })
  }
}

async function organizationLabel(organizationId: string): Promise<string> {
  const organization = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, planCode: true },
  })

  return organization
    ? `${organization.name} · plano ${organization.planCode}`
    : organizationId
}

/**
 * O aviso ao atendimento diz na linha de assunto quando o escritório é
 * prioritário — a caixa de e-mail é onde a fila realmente começa, e um selo que
 * só existe no painel chega tarde.
 */
async function priorityMark(organizationId: string): Promise<string> {
  const organization = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: { planCode: true },
  })

  if (!organization) return ''

  const priority = await priorityPlanCodes()

  return priority.has(organization.planCode) ? '[PRIORITÁRIO] ' : ''
}

function attachmentNote(count: number): string {
  if (count < 1) return ''

  return `<p style="color:#6b7280">${count} arquivo${count > 1 ? 's' : ''} em anexo — abra no painel para ver.</p>`
}

async function notifyStaffNewTicket(input: {
  ticketId: string
  kind: SupportKind
  subject: string
  body: string
  organizationId: string
  attachments?: number
}): Promise<void> {
  const [label, mark] = await Promise.all([
    organizationLabel(input.organizationId),
    priorityMark(input.organizationId),
  ])

  await safeSend({
    to: SUPPORT_INBOX,
    subject: `${mark}[${KIND_LABELS[input.kind]}] ${input.subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#111827">
        <h2 style="margin-bottom:4px">${escapeHtml(input.subject)}</h2>
        <p style="color:#6b7280;margin-top:0">${KIND_LABELS[input.kind]} · ${escapeHtml(label)}</p>
        <div style="border-left:3px solid #e5e7eb;padding-left:12px;margin:16px 0">${bodyToHtml(input.body)}</div>
        ${attachmentNote(input.attachments ?? 0)}
        <p><a href="${ticketUrl(input.ticketId, true)}">Responder no painel</a></p>
      </div>
    `,
  })
}

async function notifyStaffReply(input: {
  ticketId: string
  kind: SupportKind
  subject: string
  body: string
  organizationId: string
  attachments?: number
}): Promise<void> {
  const [label, mark] = await Promise.all([
    organizationLabel(input.organizationId),
    priorityMark(input.organizationId),
  ])

  await safeSend({
    to: SUPPORT_INBOX,
    subject: `${mark}Re: ${input.subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#111827">
        <p style="color:#6b7280">${escapeHtml(label)} respondeu:</p>
        <div style="border-left:3px solid #e5e7eb;padding-left:12px;margin:16px 0">${bodyToHtml(input.body)}</div>
        ${attachmentNote(input.attachments ?? 0)}
        <p><a href="${ticketUrl(input.ticketId, true)}">Abrir no painel</a></p>
      </div>
    `,
  })
}

async function notifyUserReply(input: {
  mail: string
  name: string
  subject: string
  kind: SupportKind
  body: string
  status: SupportStatus
  ticketId: string
}): Promise<void> {
  await safeSend({
    to: input.mail,
    subject: `LexLaboral — resposta: ${input.subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;color:#111827">
        <h2 style="margin-bottom:4px">${escapeHtml(input.subject)}</h2>
        <p style="color:#6b7280;margin-top:0">Olá, ${escapeHtml(input.name)}! O suporte do LexLaboral respondeu:</p>
        <div style="border-left:3px solid #e5e7eb;padding-left:12px;margin:16px 0">${bodyToHtml(input.body)}</div>
        <p style="color:#6b7280">Situação: <strong>${statusLabel(input.status, input.kind)}</strong></p>
        <p><a href="${ticketUrl(input.ticketId)}">Ver e responder</a></p>
      </div>
    `,
  })
}

async function notifyUserStatus(input: {
  mail: string
  name: string
  subject: string
  kind: SupportKind
  status: SupportStatus
  ticketId: string
}): Promise<void> {
  const label = statusLabel(input.status, input.kind)

  await safeSend({
    to: input.mail,
    subject:
      input.kind === 'sugestao'
        ? `LexLaboral — sua sugestão: ${label}`
        : `LexLaboral — ${input.subject}: ${label}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;color:#111827">
        <h2 style="margin-bottom:4px">${escapeHtml(input.subject)}</h2>
        <p style="color:#6b7280;margin-top:0">Olá, ${escapeHtml(input.name)}! A situação mudou para <strong>${label}</strong>.</p>
        <p><a href="${ticketUrl(input.ticketId)}">Acompanhar</a></p>
      </div>
    `,
  })
}

export { preview }
