import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertCaseVisible } from '@/services/tenant/case-access'

export const listDeadlines: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/deadlines',
    {
      preHandler: [auth],
      schema: {
        tags: ['Deadline'],
        summary: 'List deadlines for a case',
        operationId: 'listDeadlines',
        params: z.object({ caseId: z.string() }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              kind: z.string(),
              dueAt: z.date(),
              customLabel: z.string().nullable(),
              doneAt: z.date().nullable(),
              autoCalculatedFromHearingId: z.string().nullable(),
              createdAt: z.date(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      await assertCaseVisible(request.tenant, caseId)

      const deadlines = await prisma.deadline.findMany({
        where: { caseId },
        orderBy: { dueAt: 'asc' },
        select: {
          id: true,
          kind: true,
          dueAt: true,
          customLabel: true,
          doneAt: true,
          autoCalculatedFromHearingId: true,
          createdAt: true,
        },
      })

      return reply.status(200).send(deadlines)
    },
  )
}
