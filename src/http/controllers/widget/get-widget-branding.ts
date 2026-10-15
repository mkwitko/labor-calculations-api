import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { resolveWidgetBranding } from '@/services/widget/widget-key'

/**
 * Marca do escritório para a página dentro do iframe.
 *
 * Pública porque quem lê é o visitante do site do escritório, sem conta. Só sai
 * daqui o que já está estampado nesse site — nome, logo e cor. Nada de contato,
 * assinatura ou contagem de cálculos.
 */
export const getWidgetBrandingRoute: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/public/widget/:key',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '5 minute',
        },
      },
      schema: {
        tags: ['Public'],
        summary: 'Marca do escritório dono do widget',
        operationId: 'getWidgetBranding',
        params: z.object({ key: z.string().min(10).max(120) }),
        response: {
          200: z.object({
            officeName: z.string(),
            logoUrl: z.string().nullable(),
            brandPrimaryColor: z.string().nullable(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const branding = await resolveWidgetBranding(request.params.key)

      return reply.status(200).send({
        officeName: branding.officeName,
        logoUrl: branding.logoUrl,
        brandPrimaryColor: branding.brandPrimaryColor,
      })
    },
  )
}
