import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { updateLaborCalculationV3Body } from '@/http/schemas/labor-calculation-schema'
import { updateLaborCalculationV3Service } from '@/services/labor-calculation/labor-calculation-v3-service'

export const updateLaborCalculationV3: FastifyPluginCallbackZod = (app) => {
  app.put(
    '/labor-calculation/v3/:id',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['LaborCalculationV3'],
        summary: 'Update labor calculation v3 (liquidação)',
        operationId: 'updateLaborCalculationV3',
        params: z.object({
          id: z.string(),
        }),
        body: updateLaborCalculationV3Body,
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const { id } = request.params

      await updateLaborCalculationV3Service(request.tenant, id, request.body)

      return reply.status(204).send()
    },
  )
}
