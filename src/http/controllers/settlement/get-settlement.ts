import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { settlementSchema } from '@/http/schemas/settlement-schema'
import { calculationVisibility } from '@/services/tenant/visibility'

export const getSettlement: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/settlements/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlements'],
        summary: 'Get settlement by id',
        operationId: 'getSettlement',
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: settlementSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      const settlement = await prisma.settlement.findFirst({
        where: {
          id,
          laborCalculation: calculationVisibility(request.tenant),
        },
      })

      if (!settlement) {
        return reply.status(404).send({ message: 'Settlement not found' })
      }

      return settlement
    },
  )
}
