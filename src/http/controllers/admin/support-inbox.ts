import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  attachmentInput,
  attachmentView,
} from '@/http/controllers/support/support'
import { auth } from '@/http/hooks/auth'
import { requireAdmin } from '@/http/hooks/require-admin'
import { generateUploadUrl } from '@/lib/r2'
import {
  assertSupportUploadAllowed,
  buildSupportFileKey,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_SUPPORT_ATTACHMENT_SIZE,
  SUPPORT_UPLOAD_URL_EXPIRES_IN,
} from '@/services/support/support-attachment'
import {
  getTicketForStaff,
  getTicketOrganization,
  listTicketsForStaff,
  MAX_BODY_LENGTH,
  replyAsStaff,
  staffInboxSummary,
  updateTicketStatus,
} from '@/services/support/support-service'

/**
 * A fila do atendimento — o dono do produto olhando todas as organizações.
 *
 * Mesmo gate do `/admin/funnel`: `requireAdmin`, campo `User.isAdmin`. As
 * funções por trás usam `systemPrisma` justamente porque precisam atravessar o
 * escopo de organização; é esta rota que decide quem pode fazer isso.
 */

const kind = z.enum($Enums.SupportKind)
const status = z.enum($Enums.SupportStatus)

const organization = z.object({
  id: z.string(),
  name: z.string(),
  planCode: z.string(),
})

/** Deriva do plano do escritório — ver `services/support/priority-support.ts`. */
const priority = z.boolean()

const attachments = z.array(attachmentInput).max(MAX_ATTACHMENTS_PER_MESSAGE)

export const adminSupportRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/admin/support/summary',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Quantos chamados abertos e quantos por ler',
        operationId: 'getAdminSupportSummary',
        response: {
          200: z.object({ open: z.number(), unread: z.number() }),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send(await staffInboxSummary())
    },
  )

  app.get(
    '/admin/support/tickets',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Fila de chamados, atravessando organizações',
        operationId: 'listAdminSupportTickets',
        querystring: z.object({
          status: status.optional(),
          kind: kind.optional(),
          onlyOpen: z.coerce.boolean().optional(),
        }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              kind,
              status,
              subject: z.string(),
              createdAt: z.date(),
              lastMessageAt: z.date(),
              author: z
                .object({
                  id: z.string(),
                  name: z.string(),
                  mail: z.string(),
                })
                .nullable(),
              organization,
              priority,
              /** Falas do escritório que o atendimento ainda não abriu. */
              unread: z.number(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const tickets = await listTicketsForStaff(request.query)

      return reply.status(200).send(
        tickets.map((ticket) => ({
          id: ticket.id,
          kind: ticket.kind,
          status: ticket.status,
          subject: ticket.subject,
          createdAt: ticket.createdAt,
          lastMessageAt: ticket.lastMessageAt,
          author: ticket.user,
          organization: ticket.organization,
          priority: ticket.priority,
          unread: ticket._count.messages,
        })),
      )
    },
  )

  app.get(
    '/admin/support/tickets/:id',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Conversa completa, com o contexto de onde o chamado saiu',
        operationId: 'getAdminSupportTicket',
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            kind,
            status,
            subject: z.string(),
            createdAt: z.date(),
            closedAt: z.date().nullable(),
            context: z
              .object({
                path: z.string().optional(),
                appVersion: z.string().optional(),
                userAgent: z.string().optional(),
              })
              .nullable(),
            author: z
              .object({ id: z.string(), name: z.string(), mail: z.string() })
              .nullable(),
            organization,
            priority,
            messages: z.array(
              z.object({
                id: z.string(),
                body: z.string(),
                fromStaff: z.boolean(),
                createdAt: z.date(),
                author: z
                  .object({ id: z.string(), name: z.string() })
                  .nullable(),
                attachments: z.array(attachmentView),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const ticket = await getTicketForStaff(request.params.id)

      return reply.status(200).send({
        id: ticket.id,
        kind: ticket.kind,
        status: ticket.status,
        subject: ticket.subject,
        createdAt: ticket.createdAt,
        closedAt: ticket.closedAt,
        context: (ticket.context ?? null) as {
          path?: string
          appVersion?: string
          userAgent?: string
        } | null,
        author: ticket.user,
        organization: ticket.organization,
        priority: ticket.priority,
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
    '/admin/support/tickets/:id/messages',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Responde ao escritório (e avisa por e-mail)',
        operationId: 'replyAdminSupportTicket',
        params: z.object({ id: z.string() }),
        body: z.object({
          body: z.string().min(1).max(MAX_BODY_LENGTH),
          /** Muda o estágio junto com a resposta, quando fizer sentido. */
          status: status.optional(),
          attachments: attachments.optional(),
        }),
        response: { 201: z.object({ id: z.string(), status }) },
      },
    },
    async (request, reply) => {
      const result = await replyAsStaff({
        ticketId: request.params.id,
        ...request.body,
      })

      return reply.status(201).send(result)
    },
  )

  app.post(
    '/admin/support/tickets/:id/upload-url',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'URL assinada para o atendimento anexar arquivo',
        operationId: 'getAdminSupportUploadUrl',
        params: z.object({ id: z.string() }),
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
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { mimeType, sizeBytes } = request.body

      assertSupportUploadAllowed({ mimeType, sizeBytes })

      // A chave fica sob a organização do chamado, não do atendente: é lá que o
      // expurgo por retenção varre, e é de lá que o arquivo precisa sumir junto
      // com o resto da conversa.
      const ticket = await getTicketOrganization(request.params.id)
      const fileKey = buildSupportFileKey(ticket.organizationId, mimeType)
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

  app.patch(
    '/admin/support/tickets/:id',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Move o chamado ou a sugestão de estágio',
        operationId: 'updateAdminSupportTicket',
        params: z.object({ id: z.string() }),
        body: z.object({ status }),
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const result = await updateTicketStatus({
        ticketId: request.params.id,
        status: request.body.status,
      })

      return reply.status(200).send(result)
    },
  )
}
