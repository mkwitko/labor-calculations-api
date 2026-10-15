import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { summarizeApiUsage } from '@/services/api/api-usage-summary'

export const getApiUsage: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/api-keys/usage',
    {
      preHandler: [auth],
      schema: {
        tags: ['ApiKey'],
        summary: 'Read API usage for the current billing cycle',
        operationId: 'getApiUsage',
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({
            periodStart: z.string(),
            periodEnd: z.string(),
            total: z.number(),
            testTotal: z.number(),
            pending: z.number(),
            /** `null` quando o preço não é legível no Stripe. */
            estimatedCents: z.number().nullable(),
            currency: z.string().nullable(),
            byKey: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                prefix: z.string(),
                mode: z.enum(['live', 'test']),
                calls: z.number(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      // Consumo é informação de fatura: mesmo gate das chaves.
      assertRole(request.tenant, 'owner', 'admin')

      const summary = await summarizeApiUsage(request.tenant.organizationId)

      return reply.status(200).send({
        ...summary,
        periodStart: summary.periodStart.toISOString(),
        periodEnd: summary.periodEnd.toISOString(),
      })
    },
  )
}
