import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { createPublicCalculation } from '@/services/public-calculation/public-calculation-service'
import { resolveWidgetBranding } from '@/services/widget/widget-key'

const layAnswer = z.enum(['sim', 'nao', 'nao_sei'])

/**
 * Corpo estreito de propósito. Rota pública que aceitasse o input do motor
 * inteiro deixaria um anônimo mandar histórico salarial de mil meses — CPU de
 * graça. Aqui só entram as respostas do wizard, com limite em cada campo.
 */
const bodySchema = z
  .object({
    terminationType: z.enum([
      'sem_justa_causa',
      'com_justa_causa',
      'pedido_demissao',
      'rescisao_indireta',
    ]),
    startDate: z.string().date(),
    endDate: z.string().date(),
    lastSalary: z.number().positive().max(1_000_000),
    registeredContract: z.boolean(),
    priorNoticeWorked: z.boolean(),
    unpaid13ths: z.number().min(0).max(10),
    vacationVencidasCount: z.number().min(0).max(10),
    extraHours: layAnswer,
    nightWork: layAnswer,
    insalubrity: layAnswer,
    dangerousWork: layAnswer,
    source: z.string().max(60).default('site'),
    /** Quem pergunta. Muda a leitura do resultado, não o cálculo. */
    perspective: z.enum(['trabalhador', 'empresa']).default('trabalhador'),
    /** Chave do widget que hospeda o wizard, quando vem de site de terceiro. */
    widgetKey: z.string().min(10).max(120).optional(),
    /**
     * Host do site que carregou o widget, como o loader informou. Não é
     * confiável — quem atribui é a chave — e serve só para o escritório se
     * localizar quando tem mais de um site.
     */
    hostSite: z.string().max(120).optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'A data de saída não pode ser anterior à de entrada',
    path: ['endDate'],
  })

const verbaLineSchema = z.object({
  name: z.string(),
  legalRef: z.string().optional(),
  total: z.number(),
  certainty: z.enum(['documental', 'requer_prova']),
})

const employerSchema = z.object({
  severanceCost: z.number(),
  employerCharges: z.number(),
  litigationExtras: z.number(),
  exposure: z.number(),
  gap: z.number(),
})

const resultSchema = z.object({
  floor: z.number(),
  ceiling: z.number(),
  lines: z.array(verbaLineSchema),
  pending: z.array(z.string()),
  // Só na perspectiva de empresa.
  employer: employerSchema.optional(),
})

export const createPublicCalculationRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/public/calculations',
    {
      config: {
        // Cálculo público roda o motor sem autenticação: o limite por IP é a
        // única barreira. Dez por hora cobre a pessoa que refaz o cálculo
        // mudando respostas e barra script.
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
        },
      },
      schema: {
        tags: ['Public'],
        summary: 'Calcula uma rescisão sem conta e devolve o link do resultado',
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
      const { source, perspective, widgetKey, hostSite, ...answers } =
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

      const { token, result } = await createPublicCalculation({
        answers,
        source,
        perspective,
        // Dentro do iframe o Referer é o nosso próprio host, o que não diz nada
        // ao escritório. O host reportado pelo loader diz.
        referrerHost: hostSite ?? referrerHost,
        widgetOrganizationId: widget?.organizationId,
      })

      return reply.status(201).send({ token, result })
    },
  )
}
