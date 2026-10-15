import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { removeUndefined } from '@/utils/remove-undefined'

export const updateUserPrefs: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/user/prefs',
    {
      preHandler: [auth],
      schema: {
        tags: ['User'],
        summary: 'Update user notification preferences',
        operationId: 'updateUserPrefs',
        body: z.object({
          remindD3: z.boolean().optional(),
          remindD1: z.boolean().optional(),
          onbNudgeOptOut: z.boolean().optional(),
        }),
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
      const { remindD3, remindD1, onbNudgeOptOut } = request.body

      const updated = await prisma.user.update({
        where: { id: userId },
        data: removeUndefined({ remindD3, remindD1, onbNudgeOptOut }),
        select: { remindD3: true, remindD1: true, onbNudgeOptOut: true },
      })

      return reply.status(200).send(updated)
    },
  )
}
