import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { laborCalculationDetailSchema } from '@/http/schemas/labor-calculation-schema'
import { calculationVisibility } from '@/services/tenant/visibility'

const fullInclude = {
  fgtsEntries: true,
  salaryHistory: true,
  unpaidSalaries: true,
  salaryDifferencePeriods: true,
  salaryDifferenceEntries: true,
  customVerbas: true,
  settlements: true,
  indexSnapshot: { select: { hash: true } },
  verbaLines: { orderBy: { order: 'asc' } },
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

export const getLaborCalculation: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/labor-calculation/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Get labor calculation by id',
        operationId: 'getLaborCalculation',
        params: z.object({ id: z.string() }),
        response: {
          200: laborCalculationDetailSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      const calculation = await prisma.laborCalculation.findFirst({
        where: {
          id,
          ...calculationVisibility(request.tenant),
          deletedAt: null,
        },
        include: fullInclude,
      })

      if (!calculation) {
        return reply.status(404).send({ message: 'Not found' })
      }

      return {
        ...calculation,
        indexSnapshotHash: calculation.indexSnapshot?.hash ?? null,
      }
    },
  )
}
