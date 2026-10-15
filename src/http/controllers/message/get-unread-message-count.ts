import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { unreadCountForLawyer } from '@/services/messaging/message-service'

export const getUnreadMessageCount: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/messages/unread-count',
    {
      preHandler: [auth],
      schema: {
        tags: ['Message'],
        summary: 'Count unread messages',
        operationId: 'getUnreadMessageCount',
        response: {
          200: z.object({
            total: z.number(),
            byCase: z.array(
              z.object({ caseId: z.string(), count: z.number() }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = await unreadCountForLawyer(request.tenant)

      return reply.status(200).send(result)
    },
  )
}
