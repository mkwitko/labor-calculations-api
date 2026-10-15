import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'

export const getUserPrefs: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/user/prefs',
    {
      preHandler: [auth],
      schema: {
        tags: ['User'],
        summary: 'Get user notification preferences',
        operationId: 'getUserPrefs',
        response: {
          200: z.object({
            remindD3: z.boolean(),
            remindD1: z.boolean(),
            onbNudgeOptOut: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { remindD3: true, remindD1: true, onbNudgeOptOut: true },
      })
      if (!user) throw new ResourceNotFoundException('Usuário não encontrado')

      return reply.status(200).send(user)
    },
  )
}
