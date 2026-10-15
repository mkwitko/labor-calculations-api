import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { laborCalculationDetailSchema } from '@/http/schemas/labor-calculation-schema'

const fullInclude = {
  fgtsEntries: true,
  salaryHistory: true,
  unpaidSalaries: true,
  salaryDifferencePeriods: true,
  salaryDifferenceEntries: true,
  customVerbas: true,
  settlements: true,
  user: {
    select: {
      id: true,
      name: true,
      document: true,
      mail: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const

export const getClientCalculation: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/calculations/:id',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get client calculation by id',
        operationId: 'getClientCalculation',
        security: [{ BearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: {
          200: laborCalculationDetailSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, _reply) => {
      const clientId = request.user.sub
      const { id } = request.params

      const calculation = await prisma.laborCalculation.findFirst({
        where: { id, clientId, deletedAt: null },
        include: fullInclude,
      })

      if (!calculation) {
        throw new ResourceNotFoundException('Cálculo não encontrado')
      }

      return calculation
    },
  )
}
