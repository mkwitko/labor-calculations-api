import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'

export const getCaseHearings: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases/:caseId/hearings',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get case hearings for client',
        operationId: 'getCaseHearings',
        security: [{ BearerAuth: [] }],
        params: z.object({
          caseId: z.string().cuid(),
        }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              kind: z.string(),
              scheduledAt: z.string(),
              location: z.string().nullable(),
              link: z.string().nullable(),
              notes: z.string().nullable(),
            }),
          ),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const clientId = request.user.sub

      const caseExists = await prisma.case.findFirst({
        where: {
          id: caseId,
          clientId,
          deletedAt: null,
        },
        select: { id: true },
      })

      if (!caseExists) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      const hearings = await prisma.hearing.findMany({
        where: { caseId },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true,
          kind: true,
          scheduledAt: true,
          location: true,
          link: true,
          notes: true,
        },
      })

      return reply.status(200).send(
        hearings.map((h) => ({
          ...h,
          kind: h.kind,
          scheduledAt: h.scheduledAt.toISOString(),
        })),
      )
    },
  )
}
