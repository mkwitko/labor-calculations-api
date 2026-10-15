import { Prisma } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { settlementBodySchema } from '@/http/schemas/settlement-schema'
import { calculateSettlement } from '@/services/settlement/settlement-service'
import { calculationVisibility } from '@/services/tenant/visibility'

export const settlementSimulation: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/labor-calculation/:id/settlement-simulation',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlements'],
        summary: 'Simulate settlement agreement',
        operationId: 'simulateSettlement',
        params: z.object({ id: z.string() }),
        body: settlementBodySchema,
        response: {
          200: z.object({
            totalCalculatedValue: z.preprocess(
              (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
              z.number(),
            ),
            agreementRate: z.preprocess(
              (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
              z.number(),
            ),
            agreementValue: z.preprocess(
              (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
              z.number(),
            ),
            feeAmount: z.preprocess(
              (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
              z.number(),
            ),
            netToClient: z.preprocess(
              (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
              z.number(),
            ),
            estimatedTime: z.string(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { agreementRate, feeType, feeValue } = request.body

      const calculation = await prisma.laborCalculation.findFirst({
        where: { id, ...calculationVisibility(request.tenant) },
      })

      if (!calculation) {
        return reply.status(404).send({ message: 'Calculation not found' })
      }

      const totalCalculatedValue = calculation?.totalValue ?? 0
      const { agreementValue, feeAmount, netToClient, estimatedTime } =
        calculateSettlement({
          totalValue: Number(totalCalculatedValue),
          terminationType: calculation.terminationType,
          agreementRate,
          feeType,
          feeValue,
        })

      return reply.status(200).send({
        totalCalculatedValue,
        agreementRate,
        agreementValue,
        feeAmount,
        netToClient,
        estimatedTime,
      })
    },
  )
}
