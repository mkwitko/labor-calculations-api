import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { updateLaborCalculationV2Body } from '@/http/schemas/labor-calculation-schema'
import { updateLaborCalculationService } from '@/services/labor-calculation/labor-calculation-service'

export const updateLaborCalculation: FastifyPluginCallbackZod = (app) => {
  app.put(
    '/labor-calculation/:id',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Update labor calculation v2 (estimativa)',
        operationId: 'updateLaborCalculation',
        params: z.object({
          id: z.string(),
        }),
        body: updateLaborCalculationV2Body,
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const { id } = request.params
      await updateLaborCalculationService(request.tenant, id, request.body)
      return reply.status(204).send()
    },
  )
}
