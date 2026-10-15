import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { createLaborCalculationV2Body } from '@/http/schemas/labor-calculation-schema'
import { createLaborCalculationService } from '@/services/labor-calculation/labor-calculation-service'

export const createLaborCalculation: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/labor-calculation',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Create labor calculation v2 (estimativa)',
        operationId: 'createLaborCalculation',
        body: createLaborCalculationV2Body,
        response: {
          201: z.object({
            id: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      assertRole(request.tenant, 'owner', 'admin', 'lawyer')

      const calculation = await createLaborCalculationService(
        userId,
        request.body,
      )

      return reply.status(201).send({
        id: calculation.id,
      })
    },
  )
}
