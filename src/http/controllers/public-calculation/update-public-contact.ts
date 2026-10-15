import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { savePublicContact } from '@/services/public-calculation/public-calculation-service'

export const updatePublicContactRoute: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/public/calculations/:token/contact',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
        },
      },
      schema: {
        tags: ['Public'],
        summary: 'Guarda o contato de quem fez o cálculo (opcional)',
        params: z.object({ token: z.string().min(10).max(200) }),
        body: z.object({
          name: z.string().min(2).max(120).optional(),
          email: z.email().max(160).optional(),
          phone: z.string().min(8).max(20).optional(),
        }),
        response: {
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params
      await savePublicContact(token, request.body)

      return reply.status(204).send(null)
    },
  )
}
