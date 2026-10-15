import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { createLaborCalculationV3Body } from '@/http/schemas/labor-calculation-schema'
import { createLaborCalculationV3Service } from '@/services/labor-calculation/labor-calculation-v3-service'

export const createLaborCalculationV3: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/labor-calculation/v3',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['LaborCalculationV3'],
        summary: 'Create labor calculation v3 (liquidação)',
        operationId: 'createLaborCalculationV3',
        body: createLaborCalculationV3Body,
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

      const calculation = await createLaborCalculationV3Service(
        userId,
        request.body,
      )

      return reply.status(201).send({
        id: calculation.id,
      })
    },
  )
}
