import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'

export const markNotificationAsRead: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/client-portal/notifications/:notificationId/read',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Mark notification as read',
        operationId: 'markNotificationAsRead',
        security: [{ BearerAuth: [] }],
        params: z.object({
          notificationId: z.string().cuid(),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { notificationId } = request.params
      const clientId = request.user.sub

      const notification = await prisma.clientNotification.findFirst({
        where: {
          id: notificationId,
          clientId: clientId,
        },
        select: { id: true },
      })

      if (!notification) {
        throw new ResourceNotFoundException('Notificação não encontrada')
      }

      await prisma.clientNotification.update({
        where: { id: notificationId },
        data: { isRead: true },
      })

      return reply
        .status(200)
        .send({ message: 'Notificação marcada como lida' })
    },
  )
}
