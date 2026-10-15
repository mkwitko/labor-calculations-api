import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { createMessage as createMessageService } from '@/services/messaging/message-service'
import { assertCaseWritable } from '@/services/tenant/case-access'

export const createMessage: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/messages',
    {
      preHandler: [auth],
      schema: {
        tags: ['Message'],
        summary: 'Send message to client',
        operationId: 'createMessage',
        params: z.object({ caseId: z.string() }),
        body: z.object({
          body: z.string().max(5000).default(''),
          attachmentDocumentIds: z.array(z.string()).max(5).optional(),
        }),
        response: {
          201: z.object({ id: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { body, attachmentDocumentIds } = request.body

      await assertCaseWritable(request.tenant, caseId)

      const message = await createMessageService({
        caseId,
        author: { kind: 'lawyer', userId: request.user.sub },
        body,
        attachmentDocumentIds,
      })

      return reply.status(201).send(message)
    },
  )
}
