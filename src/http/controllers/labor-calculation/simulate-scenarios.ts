import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { simulateScenarios } from '@/services/labor-calculation/simulate-scenarios-service'

export const simulateScenariosController: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/labor-calculation/:id/scenarios',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary:
          'Compare calculation scenarios (with/without prescription, art. 467)',
        operationId: 'getCalculationScenarios',
        params: z.object({ id: z.string() }),
        response: {
          200: z.array(
            z.object({
              label: z.string(),
              totalValue: z.number(),
              brutoDevidoReclamante: z.number(),
              liquidoDevidoReclamante: z.number(),
              totalDevidoReclamado: z.number(),
            }),
          ),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      try {
        const scenarios = await simulateScenarios(id, request.tenant)
        return reply.status(200).send(scenarios)
      } catch (err) {
        if (err instanceof ResourceNotFoundException) {
          return reply.status(404).send({ message: err.message })
        }
        throw err
      }
    },
  )
}
