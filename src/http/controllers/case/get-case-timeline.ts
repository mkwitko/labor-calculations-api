import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { caseVisibility } from '@/services/tenant/visibility'

const activityKindSchema = z.enum([
  'case_created',
  'case_phase_changed',
  'calc_linked',
  'calc_unlinked',
  'settlement_updated',
  'doc_uploaded',
  'doc_deleted',
  'hearing_created',
  'deadline_created',
  'deadline_done',
  'note_created',
  'note_updated',
  'note_deleted',
])

export const getCaseTimeline: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/timeline',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Get case activity timeline',
        operationId: 'getCaseTimeline',
        params: z.object({ caseId: z.string() }),
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(30),
        }),
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string(),
                kind: activityKindSchema,
                payload: z.record(z.string(), z.unknown()),
                createdAt: z.date(),
                user: z.object({ id: z.string(), name: z.string() }),
              }),
            ),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { page, limit } = request.query

      const found = await prisma.case.findFirst({
        where: {
          id: caseId,
          ...caseVisibility(request.tenant),
          deletedAt: null,
        },
        select: { id: true },
      })
      if (!found) throw new ResourceNotFoundException('Caso não encontrado')

      const [data, total] = await Promise.all([
        prisma.activity.findMany({
          where: { caseId },
          select: {
            id: true,
            kind: true,
            payload: true,
            createdAt: true,
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.activity.count({ where: { caseId } }),
      ])

      return reply.status(200).send({
        data: data.map((a) => ({
          ...a,
          payload: a.payload as Record<string, unknown>,
        })),
        total,
        page,
        limit,
      })
    },
  )
}
