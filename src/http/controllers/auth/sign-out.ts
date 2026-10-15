import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth, cookieOptions } from '@/http/hooks/auth'
import { revokeAllUserTokens } from '@/services/auth/refresh-token-service'

export const signOut: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/auth/sign-out',
    {
      preHandler: [auth],
      schema: {
        tags: ['Auth'],
        summary: 'Sign out',
        operationId: 'signOut',
        description: 'Sign out of the application',
        response: {
          204: z.void(),
        },
      },
    },
    async (request, reply) => {
      await revokeAllUserTokens(request.user.sub)

      reply.clearCookie('accessToken', cookieOptions(0))
      reply.clearCookie('refreshToken', cookieOptions(0))
      return reply.status(204).send()
    },
  )
}
