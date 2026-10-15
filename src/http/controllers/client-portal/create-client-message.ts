import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { createMessage } from '@/services/messaging/message-service'

export const createClientMessage: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/cases/:caseId/messages',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Send message to the office',
        operationId: 'createClientMessage',
        security: [{ BearerAuth: [] }],
        params: z.object({ caseId: z.string() }),
        body: z.object({
          body: z.string().max(5000).default(''),
          attachmentDocumentIds: z.array(z.string()).max(5).optional(),
        }),
        response: {
          201: z.object({ id: z.string() }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { body, attachmentDocumentIds } = request.body
      const clientId = request.user.sub

      const found = await prisma.case.findFirst({
        where: { id: caseId, clientId, deletedAt: null },
        select: { id: true },
      })

      if (!found) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      const message = await createMessage({
        caseId,
        author: { kind: 'client', clientId },
        body,
        attachmentDocumentIds,
      })

      return reply.status(201).send(message)
    },
  )
}
