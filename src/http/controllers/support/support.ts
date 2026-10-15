import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { generateUploadUrl } from '@/lib/r2'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  assertSupportUploadAllowed,
  buildSupportFileKey,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_SUPPORT_ATTACHMENT_SIZE,
  SUPPORT_UPLOAD_URL_EXPIRES_IN,
} from '@/services/support/support-attachment'
import {
  closeTicket,
  countUnreadForOrganization,
  createTicket,
  getTicket,
  listTickets,
  MAX_BODY_LENGTH,
  replyAsUser,
} from '@/services/support/support-service'

/**
 * Canal do escritório com o LexLaboral.
 *
 * Sem `requireSubscription` de propósito: quem está com problema de pagamento é
 * justamente quem mais precisa falar com o suporte, e trancar o canal nessa hora
 * transforma uma dúvida de cobrança em cancelamento.
 *
 * Sem `assertRole` também: qualquer pessoa do escritório pode pedir ajuda. O que
 * ela vê é o que a organização dela abriu — isso quem garante é a extension de
 * tenant.
 */

const kind = z.enum($Enums.SupportKind)
const status = z.enum($Enums.SupportStatus)

const ticketSummary = z.object({
  id: z.string(),
  kind,
  status,
  subject: z.string(),
  createdAt: z.date(),
  lastMessageAt: z.date(),
  author: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** Respostas do atendimento ainda não abertas por ninguém do escritório. */
  unread: z.number(),
})

/** O que a tela recebe de um anexo. `url` some quando a varredura acusa vírus. */
export const attachmentView = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  scanStatus: z.enum(['pending', 'clean', 'infected', 'skipped']),
  url: z.string().nullable(),
})

/** O que a tela envia depois de subir o arquivo direto para o R2. */
export const attachmentInput = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().min(1).max(MAX_SUPPORT_ATTACHMENT_SIZE),
})

const attachments = z.array(attachmentInput).max(MAX_ATTACHMENTS_PER_MESSAGE)

const ticketMessage = z.object({
  id: z.string(),
  body: z.string(),
  fromStaff: z.boolean(),
  createdAt: z.date(),
  author: z.object({ id: z.string(), name: z.string() }).nullable(),
  attachments: z.array(attachmentView),
})

export const supportRoutes: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/support/tickets',
    {
      preHandler: [auth],
      schema: {
        tags: ['Support'],
        summary: 'Abre um chamado ou envia uma sugestão',
        operationId: 'createSupportTicket',
        body: z.object({
          kind,
          subject: z.string().min(3).max(160),
          body: z.string().min(1).max(MAX_BODY_LENGTH),
          /** De onde saiu o chamado. A tela preenche; ninguém digita. */
          context: z
            .object({
              path: z.string().max(300).optional(),
              appVersion: z.string().max(60).optional(),
              userAgent: z.string().max(400).optional(),
            })
            .optional(),
          attachments: attachments.optional(),
        }),
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const ticket = await createTicket({
        userId: request.user.sub,
        ...request.body,
      })

      return reply.status(201).send({ id: ticket.id })
    },
  )

  app.get(
    '/support/tickets',
    {
      preHandler: [auth],
      schema: {
        tags: ['Support'],
        summary: 'Chamados e sugestões do escritório',
        operationId: 'listSupportTickets',
        querystring: z.object({
          open: z.coerce.boolean().optional(),
        }),
        response: { 200: z.array(ticketSummary) },
      },
    },
    async (request, reply) => {
      const tickets = await listTickets({ open: request.query.open })

      return reply.status(200).send(
        tickets.map((ticket) => ({
          id: ticket.id,
          kind: ticket.kind,
          status: ticket.status,
          subject: ticket.subject,
          createdAt: ticket.createdAt,
          lastMessageAt: ticket.lastMessageAt,
          author: ticket.user,
          unread: ticket._count.messages,
        })),
      )
    },
  )

  app.get(
    '/support/tickets/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['Support'],
        summary: 'Conversa de um chamado',
        operationId: 'getSupportTicket',
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            kind,
            status,
            subject: z.string(),
            createdAt: z.date(),
            closedAt: z.date().nullable(),
            author: z.object({ id: z.string(), name: z.string() }).nullable(),
            messages: z.array(ticketMessage),
          }),
        },
      },
    },
    async (request, reply) => {
      const ticket = await getTicket(request.params.id)

      return reply.status(200).send({
        id: ticket.id,
        kind: ticket.kind,
        status: ticket.status,
        subject: ticket.subject,
        createdAt: ticket.createdAt,
        closedAt: ticket.closedAt,
        author: ticket.user,
        messages: ticket.messages.map((message) => ({
          id: message.id,
          body: message.body,
          fromStaff: message.fromStaff,
          createdAt: message.createdAt,
          author: message.user,
          attachments: message.attachments,
        })),
      })
    },
  )

  app.post(
    '/support/tickets/:id/messages',
    {
      preHandler: [auth],
      schema: {
        tags: ['Support'],
        summary: 'Responde no chamado',
        operationId: 'replySupportTicket',
        params: z.object({ id: z.string() }),
        body: z.object({
          body: z.string().min(1).max(MAX_BODY_LENGTH),
          attachments: attachments.optional(),
        }),
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const result = await replyAsUser({
        ticketId: request.params.id,
        userId: request.user.sub,
        body: request.body.body,
        attachments: request.body.attachments,
      })

      return reply.status(201).send(result)
    },
  )

  app.post(
    '/support/tickets/:id/close',
    {
      preHandler: [auth],
      schema: {
        tags: ['Support'],
        summary: 'Encerra o próprio chamado',
        operationId: 'closeSupportTicket',
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const result = await closeTicket(request.params.id)

      return reply.status(200).send(result)
    },
  )

  app.post(
    '/support/upload-url',
    {
      preHandler: [auth],
      schema: {
        tags: ['Support'],
        summary: 'URL assinada para subir um anexo do suporte',
        operationId: 'getSupportUploadUrl',
        body: z.object({
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1),
          sizeBytes: z.number().min(1).max(MAX_SUPPORT_ATTACHMENT_SIZE),
        }),
        response: {
          200: z.object({
            uploadUrl: z.string(),
            fileKey: z.string(),
            expiresIn: z.number(),
          }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { mimeType, sizeBytes } = request.body

      assertSupportUploadAllowed({ mimeType, sizeBytes })

      // A chave leva a organização de quem sobe. O arquivo só entra na conversa
      // quando a mensagem é gravada — chave órfã não aparece em tela nenhuma e
      // some no expurgo do bucket.
      const fileKey = buildSupportFileKey(requireOrganizationId(), mimeType)
      const uploadUrl = await generateUploadUrl(
        fileKey,
        mimeType,
        SUPPORT_UPLOAD_URL_EXPIRES_IN,
      )

      return reply
        .status(200)
        .send({ uploadUrl, fileKey, expiresIn: SUPPORT_UPLOAD_URL_EXPIRES_IN })
    },
  )

  app.get(
    '/support/unread-count',
    {
      preHandler: [auth],
      schema: {
        tags: ['Support'],
        summary: 'Respostas do suporte ainda não lidas',
        operationId: 'getSupportUnreadCount',
        response: { 200: z.object({ unread: z.number() }) },
      },
    },
    async (_request, reply) => {
      const unread = await countUnreadForOrganization()

      return reply.status(200).send({ unread })
    },
  )
}
