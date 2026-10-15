import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { caseVisibility } from '@/services/tenant/visibility'

const casePhaseSchema = z.enum([
  'pre_judicial',
  'distribuido',
  'conhecimento',
  'recurso',
  'execucao',
  'encerrado',
])

const listItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  processNumber: z.string().nullable(),
  court: z.string().nullable(),
  vara: z.string().nullable(),
  phase: casePhaseSchema,
  openedAt: z.date(),
  closedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  client: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  _count: z.object({
    calculations: z.number(),
  }),
})

export const listCases: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'List cases',
        operationId: 'listCases',
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
          phase: casePhaseSchema.optional(),
          search: z.string().optional(),
        }),
        response: {
          200: z.object({
            data: z.array(listItemSchema),
            nextCursor: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const { limit, cursor, phase, search } = request.query

      const cases = await prisma.case.findMany({
        where: {
          ...caseVisibility(request.tenant),
          deletedAt: null,
          ...(phase ? { phase } : {}),
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: 'insensitive' } },
                  { processNumber: { contains: search, mode: 'insensitive' } },
                  {
                    client: { name: { contains: search, mode: 'insensitive' } },
                  },
                ],
              }
            : {}),
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          title: true,
          processNumber: true,
          court: true,
          vara: true,
          phase: true,
          openedAt: true,
          closedAt: true,
          createdAt: true,
          updatedAt: true,
          client: { select: { id: true, name: true } },
          _count: { select: { calculations: true } },
        },
      })

      const hasMore = cases.length > limit
      const items = hasMore ? cases.slice(0, -1) : cases
      const nextCursor = hasMore ? items[items.length - 1].id : null

      return { data: items, nextCursor }
    },
  )
}
