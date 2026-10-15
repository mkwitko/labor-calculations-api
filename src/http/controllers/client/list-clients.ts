import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'

export const listClients: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/clients',
    {
      preHandler: [auth],
      schema: {
        tags: ['Client'],
        summary: 'List clients',
        operationId: 'listClients',
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
        }),
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                document: z.string().nullable(),
                mail: z.string().nullable(),
                phone: z.string().nullable(),
                createdAt: z.date(),
                _count: z.object({ laborCalculations: z.number() }),
              }),
            ),
            nextCursor: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const { limit, cursor } = request.query

      const clients = await prisma.client.findMany({
        where: {
          deletedAt: null,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          name: true,
          document: true,
          mail: true,
          phone: true,
          createdAt: true,
          _count: { select: { laborCalculations: true } },
        },
      })

      const hasMore = clients.length > limit
      const items = hasMore ? clients.slice(0, -1) : clients
      const nextCursor = hasMore ? items[items.length - 1].id : null

      return { data: items, nextCursor }
    },
  )
}
