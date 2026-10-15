import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireAdmin } from '@/http/hooks/require-admin'
import { getPublicFunnel } from '@/services/public-calculation/public-funnel'

export const getPublicFunnelRoute: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/admin/funnel',
    {
      // `requireAdmin` é o mesmo gate das rotas de índices monetários: campo
      // `User.isAdmin`, com caminho rápido pelo claim do JWT.
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Funil da calculadora pública, atravessando organizações',
        operationId: 'getPublicFunnel',
        querystring: z.object({
          days: z.coerce.number().int().min(1).max(365).default(30),
        }),
        response: {
          200: z.object({
            range: z.object({ days: z.number(), since: z.date() }),
            totals: z.object({
              created: z.number(),
              withContact: z.number(),
              claimed: z.number(),
              contactRate: z.number(),
              claimRate: z.number(),
            }),
            bySource: z.array(
              z.object({
                source: z.string(),
                created: z.number(),
                withContact: z.number(),
                claimed: z.number(),
              }),
            ),
            byPerspective: z.array(
              z.object({
                perspective: z.string(),
                created: z.number(),
                withContact: z.number(),
                claimed: z.number(),
              }),
            ),
            daily: z.array(
              z.object({
                date: z.string(),
                created: z.number(),
                claimed: z.number(),
              }),
            ),
            medianHoursToClaim: z.number().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const funnel = await getPublicFunnel(request.query.days)

      return reply.status(200).send(funnel)
    },
  )
}
