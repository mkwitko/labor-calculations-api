import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { settlementSchema } from '@/http/schemas/settlement-schema'
import { calculationVisibility } from '@/services/tenant/visibility'

export const listSettlements: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/labor-calculation/:laborCalculationId/settlements',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlements'],
        summary: 'List settlements for a labor calculation',
        operationId: 'listSettlements',
        params: z.object({
          laborCalculationId: z.string(),
        }),
        response: {
          200: z.array(settlementSchema),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { laborCalculationId } = request.params

      const calculation = await prisma.laborCalculation.findFirst({
        where: {
          id: laborCalculationId,
          ...calculationVisibility(request.tenant),
        },
      })

      if (!calculation) {
        return reply.status(404).send({ message: 'Calculation not found' })
      }

      return prisma.settlement.findMany({
        where: { laborCalculationId },
        orderBy: { createdAt: 'desc' },
      })
    },
  )
}
