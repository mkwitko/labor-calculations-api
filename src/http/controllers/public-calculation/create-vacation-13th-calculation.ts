import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { createVacationAnd13thCalculation } from '@/services/verba-calculation/verba-calculation-service'
import { resolveWidgetBranding } from '@/services/widget/widget-key'

/** Corpo estreito pela mesma razão do endpoint de horas extras. */
const bodySchema = z
  .object({
    monthlySalary: z.number().positive().max(1_000_000),
    startDate: z.string().date(),
    /** Ausente quando a pessoa ainda trabalha na empresa. */
    endDate: z.string().date().optional(),
    vacationVencidasCount: z.number().min(0).max(10),
    unpaid13ths: z.number().min(0).max(10),
    source: z.string().max(60).default('site'),
    widgetKey: z.string().min(10).max(120).optional(),
    hostSite: z.string().max(120).optional(),
  })
  .refine((data) => !data.endDate || data.startDate <= data.endDate, {
    message: 'A data de saída não pode ser anterior à de entrada',
    path: ['endDate'],
  })

const verbaLineSchema = z.object({
  name: z.string(),
  legalRef: z.string().optional(),
  total: z.number(),
  certainty: z.enum(['documental', 'requer_prova']),
})

const resultSchema = z.object({
  floor: z.number(),
  ceiling: z.number(),
  lines: z.array(verbaLineSchema),
  pending: z.array(z.string()),
  prescribed: z.boolean(),
})

export const createVacationAnd13thCalculationRoute: FastifyPluginCallbackZod = (
  app,
) => {
  app.post(
    '/public/calculations/ferias-decimo-terceiro',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
        },
      },
      schema: {
        tags: ['Public'],
        summary: 'Calcula férias e 13º sem conta e devolve o link do resultado',
        body: bodySchema,
        response: {
          201: z.object({
            token: z.string(),
            result: resultSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const { source, widgetKey, hostSite, startDate, endDate, ...rest } =
        request.body

      const widget = widgetKey ? await resolveWidgetBranding(widgetKey) : null

      const referrer = request.headers.referer
      let referrerHost: string | undefined
      if (referrer) {
        try {
          referrerHost = new URL(referrer).host
        } catch {
          referrerHost = undefined
        }
      }

      const { token, result } = await createVacationAnd13thCalculation({
        input: {
          ...rest,
          startDate: new Date(`${startDate}T00:00:00.000Z`),
          endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined,
        },
        source,
        referrerHost: hostSite ?? referrerHost,
        widgetOrganizationId: widget?.organizationId,
      })

      return reply.status(201).send({ token, result })
    },
  )
}
