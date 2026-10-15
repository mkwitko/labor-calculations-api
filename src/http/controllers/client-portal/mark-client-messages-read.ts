import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { markMessagesRead } from '@/services/messaging/message-service'

export const markClientMessagesRead: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/cases/:caseId/messages/read',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Mark case messages as read (client)',
        operationId: 'markClientMessagesRead',
        security: [{ BearerAuth: [] }],
        params: z.object({ caseId: z.string() }),
        response: {
          200: z.object({ updated: z.number() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      const found = await prisma.case.findFirst({
        where: { id: caseId, clientId: request.user.sub, deletedAt: null },
        select: { id: true },
      })

      if (!found) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      const result = await markMessagesRead({ caseId, viewer: 'client' })

      return reply.status(200).send(result)
    },
  )
}
