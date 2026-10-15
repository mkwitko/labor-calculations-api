import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { caseRelationVisibility } from '@/services/tenant/visibility'

export const listAllHearings: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/hearings',
    {
      preHandler: [auth],
      schema: {
        tags: ['Hearing'],
        summary: 'List all hearings for the authenticated user',
        operationId: 'listAllHearings',
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              caseId: z.string(),
              caseTitle: z.string(),
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
      const hearings = await prisma.hearing.findMany({
        where: { case: caseRelationVisibility(request.tenant) },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true,
          caseId: true,
          kind: true,
          scheduledAt: true,
          location: true,
          link: true,
          notes: true,
          createdAt: true,
          case: { select: { title: true } },
        },
      })

      return reply.status(200).send(
        hearings.map((h) => ({
          ...h,
          caseTitle: h.case.title,
          case: undefined,
        })),
      )
    },
  )
}
