import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { clientAuth } from '@/http/hooks/client-auth'

export const markAllNotificationsAsRead: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/client-portal/notifications/read-all',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Mark all notifications as read',
        operationId: 'markAllNotificationsAsRead',
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({
            message: z.string(),
            count: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const clientId = request.user.sub

      const result = await prisma.clientNotification.updateMany({
        where: {
          clientId: clientId,
          isRead: false,
        },
        data: { isRead: true },
      })

      return reply.status(200).send({
        message: 'Todas as notificações foram marcadas como lidas',
        count: result.count,
      })
    },
  )
}
