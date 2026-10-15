import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { listMessages as listMessagesService } from '@/services/messaging/message-service'
import { assertCaseVisible } from '@/services/tenant/case-access'

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

export const listMessages: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/messages',
    {
      preHandler: [auth],
      schema: {
        tags: ['Message'],
        summary: 'List case messages',
        operationId: 'listMessages',
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
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { cursor, limit } = request.query

      await assertCaseVisible(request.tenant, caseId)

      const page = await listMessagesService({
        caseId,
        viewer: 'lawyer',
        cursor,
        limit,
      })

      return reply.status(200).send(page)
    },
  )
}
