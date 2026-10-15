import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { decimalField } from '@/http/schemas/zod-helpers'
import { calculationVisibility } from '@/services/tenant/visibility'

const listItemSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  // O seletor de cálculo na criação de caso precisa saber o que já está
  // vinculado: escolher um cálculo de outro caso o moveria de lugar.
  caseId: z.string().nullable(),
  clientName: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  endDate: z.date(),
  status: z.string(),
  terminationType: z.string(),
  calculationVersion: z.string(),
  totalValue: decimalField.nullable(),
})

export const listLaborCalculations: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/labor-calculation',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'List labor calculations',
        operationId: 'listLaborCalculation',
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
          clientId: z.string().optional(),
          search: z.string().optional(),
          terminationType: z.enum($Enums.TerminationType).optional(),
          calculationVersion: z.string().optional(),
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
      const {
        limit,
        cursor,
        clientId,
        search,
        terminationType,
        calculationVersion,
      } = request.query

      const calculations = await prisma.laborCalculation.findMany({
        where: {
          ...calculationVisibility(request.tenant),
          deletedAt: null,
          ...(cursor ? { id: { lt: cursor } } : {}),
          ...(clientId ? { clientId } : {}),
          ...(search
            ? { clientName: { contains: search, mode: 'insensitive' } }
            : {}),
          ...(terminationType ? { terminationType } : {}),
          ...(calculationVersion ? { calculationVersion } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          clientId: true,
          caseId: true,
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

      return { data: items, nextCursor }
    },
  )
}
