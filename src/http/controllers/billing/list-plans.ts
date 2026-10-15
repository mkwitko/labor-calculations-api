import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { HttpException } from '@/http/exceptions/http-exception'
import { loadCatalog, PLAN_CODES } from '@/services/billing/list-plans'

const planPriceSchema = z.object({
  priceId: z.string(),
  amountCents: z.number(),
})

export const listBillingPlans: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/billing/plans',
    {
      // Sem `auth`: a landing mostra preço antes de qualquer cadastro.
      config: {
        rateLimit: { max: 120, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['Billing'],
        summary: 'List office plans as configured in Stripe',
        operationId: 'listBillingPlans',
        response: {
          200: z.object({
            data: z.array(
              z.object({
                code: z.enum(PLAN_CODES),
                name: z.string(),
                maxMembers: z.number(),
                rank: z.number(),
                currency: z.string(),
                allowsExtraMembers: z.boolean(),
                monthly: planPriceSchema.nullable(),
                yearly: planPriceSchema.nullable(),
              }),
            ),
            // O preço do advogado adicional não pertence a plano nenhum, mas a
            // landing precisa dele junto: sem ele o card do plano grande diria
            // "aceita mais gente" sem dizer quanto custa.
            extraMember: z.object({
              monthly: planPriceSchema.nullable(),
              yearly: planPriceSchema.nullable(),
            }),
          }),
        },
      },
    },
    async (_request, reply) => {
      try {
        const { plans, extraMember } = await loadCatalog()

        // Nenhum plano legível é 503, não uma lista vazia: a tela precisa
        // distinguir "não há plano" de "não consegui saber o preço", senão
        // renderiza uma página de preços sem preço e parece produto quebrado.
        if (plans.length === 0) {
          throw new HttpException(
            503,
            'Não foi possível ler os planos no Stripe',
            'ServiceUnavailableException',
          )
        }

        return reply.status(200).send({ data: plans, extraMember })
      } catch (error) {
        if (error instanceof HttpException) throw error

        throw new HttpException(
          503,
          'Não foi possível ler os planos no Stripe',
          'ServiceUnavailableException',
        )
      }
    },
  )
}
