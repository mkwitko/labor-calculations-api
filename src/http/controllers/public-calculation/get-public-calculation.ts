import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { getPublicCalculationByToken } from '@/services/public-calculation/public-calculation-service'

export const getPublicCalculationRoute: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/public/calculations/:token',
    {
      schema: {
        tags: ['Public'],
        summary: 'Lê um cálculo público pelo token do link',
        params: z.object({ token: z.string().min(10).max(200) }),
        response: {
          200: z.object({
            result: z.object({
              floor: z.number(),
              ceiling: z.number(),
              lines: z.array(
                z.object({
                  name: z.string(),
                  legalRef: z.string().optional(),
                  total: z.number(),
                  certainty: z.enum(['documental', 'requer_prova']),
                }),
              ),
              pending: z.array(z.string()),
              // Só nas calculadoras de verba isolada: pretensão extinta pela
              // prescrição bienal, com o resultado zerado de propósito.
              prescribed: z.boolean().optional(),
              employer: z
                .object({
                  severanceCost: z.number(),
                  employerCharges: z.number(),
                  litigationExtras: z.number(),
                  exposure: z.number(),
                  gap: z.number(),
                })
                .optional(),
            }),
            kind: z.enum(['rescisao', 'horas_extras', 'ferias_13']),
            perspective: z.enum(['trabalhador', 'empresa']),
            createdAt: z.date(),
            // O contato em si nunca sai daqui: a tela só precisa saber se já foi
            // dado, para não pedir de novo.
            hasContact: z.boolean(),
            claimed: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params
      const found = await getPublicCalculationByToken(token)

      return reply.status(200).send(found)
    },
  )
}
