import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'

export const signOutClient: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/client-portal/sessions',
    {
      schema: {
        tags: ['ClientPortal'],
        summary: 'Client portal sign out',
        operationId: 'signOutClient',
        response: {
          200: z.object({}),
        },
      },
    },
    async (_request, reply) => {
      reply.clearCookie('clientAccessToken', {
        path: '/',
        httpOnly: true,
        secure: env.ENV !== 'development',
        sameSite: env.ENV === 'development' ? 'lax' : 'none',
      })
      return reply.status(200).send({})
    },
  )
}
