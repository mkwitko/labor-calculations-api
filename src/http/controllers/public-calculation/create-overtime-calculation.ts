import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { createOvertimeCalculation } from '@/services/verba-calculation/verba-calculation-service'
import { resolveWidgetBranding } from '@/services/widget/widget-key'

/**
 * Corpo estreito, pela mesma razão do endpoint de rescisão: rota pública que
 * aceita entrada larga é CPU de graça para script. O teto de 40 horas extras
 * semanais já é o dobro do que a Justiça costuma reconhecer.
 */
const bodySchema = z
  .object({
    monthlySalary: z.number().positive().max(1_000_000),
    weeklySchedule: z.union([z.literal(44), z.literal(40)]),
    extraHoursPerWeek: z.number().positive().max(40),
    startDate: z.string().date(),
    endDate: z.string().date(),
    source: z.string().max(60).default('site'),
    /** Chave do widget que hospeda o formulário, quando vem de site de terceiro. */
    widgetKey: z.string().min(10).max(120).optional(),
    hostSite: z.string().max(120).optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'A data final não pode ser anterior à inicial',
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

export const createOvertimeCalculationRoute: FastifyPluginCallbackZod = (
  app,
) => {
  app.post(
    '/public/calculations/horas-extras',
    {
      config: {
        // Mesmo limite do cálculo de rescisão: dez por hora cobre quem refaz a
        // conta mudando as respostas e barra script.
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
        },
      },
      schema: {
        tags: ['Public'],
        summary: 'Calcula horas extras sem conta e devolve o link do resultado',
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

      // Chave inválida é 404, não silêncio: se o cálculo caísse como anônimo, o
      // escritório continuaria achando que o widget dele atribui.
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

      const { token, result } = await createOvertimeCalculation({
        input: {
          ...rest,
          startDate: new Date(`${startDate}T00:00:00.000Z`),
          endDate: new Date(`${endDate}T00:00:00.000Z`),
        },
        source,
        // Dentro do iframe o Referer é o nosso próprio host, o que não diz nada
        // ao escritório. O host reportado pelo loader diz.
        referrerHost: hostSite ?? referrerHost,
        widgetOrganizationId: widget?.organizationId,
      })

      return reply.status(201).send({ token, result })
    },
  )
}
