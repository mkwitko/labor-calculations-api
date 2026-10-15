import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { clientAuth } from '@/http/hooks/client-auth'
import { unreadCountForClient } from '@/services/messaging/message-service'

export const getClientUnreadMessageCount: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/messages/unread-count',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Count unread messages (client)',
        operationId: 'getClientUnreadMessageCount',
        security: [{ BearerAuth: [] }],
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
      // Sem checagem de caso: o serviço já filtra por `case.clientId`.
      const result = await unreadCountForClient(request.user.sub)

      return reply.status(200).send(result)
    },
  )
}
