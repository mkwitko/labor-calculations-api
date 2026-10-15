import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertCaseVisible } from '@/services/tenant/case-access'

export const listHearings: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/hearings',
    {
      preHandler: [auth],
      schema: {
        tags: ['Hearing'],
        summary: 'List hearings for a case',
        operationId: 'listHearings',
        params: z.object({ caseId: z.string() }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              kind: z.string(),
              scheduledAt: z.date(),
              location: z.string().nullable(),
              link: z.string().nullable(),
              notes: z.string().nullable(),
              createdAt: z.date(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      await assertCaseVisible(request.tenant, caseId)

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
          createdAt: true,
        },
      })

      return reply.status(200).send(hearings)
    },
  )
}
