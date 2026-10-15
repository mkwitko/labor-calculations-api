import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

export const checkAuth: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/auth/status',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Check auth',
        description: 'Check auth to the application',
        operationId: 'checkAuth',
        response: {
          200: z.object({
            isAuthenticated: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const authorization = request.headers.authorization

      const headerAccessToken = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined

      const token = request.cookies.accessToken || headerAccessToken

      if (!token) {
        return reply.status(200).send({
          isAuthenticated: false,
        })
      }

      try {
        await app.jwt.verify(token)
        return reply.status(200).send({
          isAuthenticated: true,
        })
      } catch {
        return reply.status(200).send({
          isAuthenticated: false,
        })
      }
    },
  )
}
