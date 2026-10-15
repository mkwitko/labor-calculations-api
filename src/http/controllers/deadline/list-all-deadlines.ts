import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { caseRelationVisibility } from '@/services/tenant/visibility'

export const listAllDeadlines: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/deadlines',
    {
      preHandler: [auth],
      schema: {
        tags: ['Deadline'],
        summary: 'List all deadlines for the authenticated user',
        operationId: 'listAllDeadlines',
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              caseId: z.string(),
              caseTitle: z.string(),
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
      const deadlines = await prisma.deadline.findMany({
        where: { case: caseRelationVisibility(request.tenant) },
        orderBy: { dueAt: 'asc' },
        select: {
          id: true,
          caseId: true,
          kind: true,
          dueAt: true,
          customLabel: true,
          doneAt: true,
          autoCalculatedFromHearingId: true,
          createdAt: true,
          case: { select: { title: true } },
        },
      })

      return reply.status(200).send(
        deadlines.map((d) => ({
          ...d,
          caseTitle: d.case.title,
          case: undefined,
        })),
      )
    },
  )
}
