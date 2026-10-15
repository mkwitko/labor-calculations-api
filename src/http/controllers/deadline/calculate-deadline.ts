import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { addBusinessDays, isBusinessDay } from '@/utils/business-days'

// Calculates a deadline date counting business days (skips weekends and
// national holidays) from a base date. Used by the smart deadline helper.
export const calculateDeadline: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/deadlines/calculate',
    {
      preHandler: [auth],
      schema: {
        tags: ['Deadline'],
        summary: 'Calculate a deadline date in business days',
        operationId: 'calculateDeadline',
        body: z.object({
          startDate: z.coerce.date(),
          businessDays: z.number().int().min(1).max(365),
          // When true, counting starts the next business day (publication rule).
          startNextBusinessDay: z.boolean().default(true),
        }),
        response: {
          200: z.object({ dueAt: z.date() }),
        },
      },
    },
    async (request, reply) => {
      const { startDate, businessDays, startNextBusinessDay } = request.body

      // "Prazo processual": exclui o dia do início; conta a partir do próximo
      // dia útil (art. 775 CLT / art. 224 CPC).
      let base = new Date(startDate)
      if (startNextBusinessDay) {
        do {
          base.setDate(base.getDate() + 1)
        } while (!isBusinessDay(base))
        // já avançamos 1 dia útil; contar os restantes
        base = addBusinessDays(base, businessDays - 1)
      } else {
        base = addBusinessDays(base, businessDays)
      }

      return reply.status(200).send({ dueAt: base })
    },
  )
}
