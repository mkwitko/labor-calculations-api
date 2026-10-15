import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { reindexLaborCalculation } from '@/services/labor-calculation/reindex-calculation-service'

const deltaSchema = z.object({
  from: z.number(),
  to: z.number(),
  delta: z.number(),
})

export const reindexLaborCalculationRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/labor-calculation/:id/reindex',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculationV3'],
        summary:
          'Preview or apply fresh monetary indices to a stored calculation',
        operationId: 'reindexLaborCalculation',
        params: z.object({ id: z.string() }),
        body: z.object({
          // Sem confirm, é só simulação: nada é gravado. O usuário precisa ver
          // o impacto antes de mover o valor de um cálculo já fechado.
          confirm: z.boolean().default(false),
        }),
        response: {
          200: z.object({
            applied: z.boolean(),
            engineVersion: z.object({
              from: z.string().nullable(),
              to: z.string(),
            }),
            indexSnapshot: z.object({
              fromId: z.string().nullable(),
              toId: z.string(),
              fromHash: z.string().nullable(),
              toHash: z.string(),
              unchanged: z.boolean(),
            }),
            totals: z.object({
              totalValue: deltaSchema,
              brutoDevidoReclamante: deltaSchema,
              liquidoDevidoReclamante: deltaSchema,
              totalDevidoReclamado: deltaSchema,
            }),
            verbas: z.array(
              z.object({
                name: z.string(),
                from: z.number(),
                to: z.number(),
                delta: z.number(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const { id } = request.params

      const result = await reindexLaborCalculation(
        request.tenant,
        id,
        request.body.confirm,
      )

      return reply.status(200).send(result)
    },
  )
}
