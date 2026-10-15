import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { clientAuth } from '@/http/hooks/client-auth'
import { decimalField } from '@/http/schemas/zod-helpers'

const listItemSchema = z.object({
  id: z.string(),
  clientName: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  endDate: z.date(),
  status: z.string(),
  terminationType: z.string(),
  calculationVersion: z.string(),
  totalValue: decimalField.nullable(),
})

export const listClientCalculations: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/calculations',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'List client calculations',
        operationId: 'listClientCalculations',
        security: [{ BearerAuth: [] }],
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
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
      const clientId = request.user.sub
      const { limit, cursor } = request.query

      const calculations = await prisma.laborCalculation.findMany({
        where: {
          clientId,
          deletedAt: null,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          clientName: true,
          createdAt: true,
          updatedAt: true,
          endDate: true,
          status: true,
          terminationType: true,
          calculationVersion: true,
          totalValue: true,
        },
      })

      const hasMore = calculations.length > limit
      const items = hasMore ? calculations.slice(0, -1) : calculations
      const nextCursor = hasMore ? items[items.length - 1].id : null

      const data = items.map((c) => ({
        id: c.id,
        clientName: c.clientName,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        endDate: c.endDate,
        status: c.status,
        terminationType: c.terminationType,
        calculationVersion: c.calculationVersion,
        totalValue: c.totalValue ?? null,
      }))

      return { data, nextCursor }
    },
  )
}
