import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'

export const getCaseDeadlines: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases/:caseId/deadlines',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get case deadlines for client',
        operationId: 'getCaseDeadlines',
        security: [{ BearerAuth: [] }],
        params: z.object({
          caseId: z.string().cuid(),
        }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              kind: z.string(),
              customLabel: z.string().nullable(),
              dueAt: z.string(),
              doneAt: z.string().nullable(),
              autoCalculatedFromHearingId: z.string().nullable(),
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

      const deadlines = await prisma.deadline.findMany({
        where: { caseId },
        orderBy: { dueAt: 'asc' },
        select: {
          id: true,
          kind: true,
          customLabel: true,
          dueAt: true,
          doneAt: true,
          autoCalculatedFromHearingId: true,
        },
      })

      return reply.status(200).send(
        deadlines.map((d) => ({
          ...d,
          kind: d.kind,
          dueAt: d.dueAt.toISOString(),
          doneAt: d.doneAt?.toISOString() ?? null,
        })),
      )
    },
  )
}
