import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { listMessages } from '@/services/messaging/message-service'

const messageSchema = z.object({
  id: z.string(),
  authorKind: z.enum(['lawyer', 'client']),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  attachments: z.array(
    z.object({
      documentId: z.string(),
      fileKey: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
    }),
  ),
})

export const listClientMessages: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases/:caseId/messages',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'List case messages as client',
        operationId: 'listClientMessages',
        security: [{ BearerAuth: [] }],
        params: z.object({ caseId: z.string() }),
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().min(1).max(100).optional(),
        }),
        response: {
          200: z.object({
            items: z.array(messageSchema),
            nextCursor: z.string().nullable(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { cursor, limit } = request.query

      const found = await prisma.case.findFirst({
        where: { id: caseId, clientId: request.user.sub, deletedAt: null },
        select: { id: true },
      })

      if (!found) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      const page = await listMessages({
        caseId,
        viewer: 'client',
        cursor,
        limit,
      })

      return reply.status(200).send(page)
    },
  )
}
