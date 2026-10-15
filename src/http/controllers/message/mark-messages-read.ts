import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { markMessagesRead as markMessagesReadService } from '@/services/messaging/message-service'
import { assertCaseVisible } from '@/services/tenant/case-access'

export const markMessagesRead: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/messages/read',
    {
      preHandler: [auth],
      schema: {
        tags: ['Message'],
        summary: 'Mark case messages as read',
        operationId: 'markMessagesRead',
        params: z.object({ caseId: z.string() }),
        response: { 200: z.object({ updated: z.number() }) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      await assertCaseVisible(request.tenant, caseId)

      const result = await markMessagesReadService({ caseId, viewer: 'lawyer' })

      return reply.status(200).send(result)
    },
  )
}
