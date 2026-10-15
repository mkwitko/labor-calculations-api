import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { clientAuth } from '@/http/hooks/client-auth'

export const getClientNotifications: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/notifications',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get client notifications',
        operationId: 'getClientNotifications',
        security: [{ BearerAuth: [] }],
        querystring: z.object({
          limit: z.coerce.number().min(1).max(100).default(50),
          offset: z.coerce.number().min(0).default(0),
          unreadOnly: z.coerce.boolean().default(false),
        }),
        response: {
          200: z.object({
            notifications: z.array(
              z.object({
                id: z.string(),
                type: z.string(),
                title: z.string(),
                message: z.string(),
                link: z.string().nullable(),
                isRead: z.boolean(),
                createdAt: z.string(),
              }),
            ),
            total: z.number(),
            unreadCount: z.number(),
            hasMore: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const clientId = request.user.sub
      const { limit, offset, unreadOnly } = request.query

      const where: { clientId: string; isRead?: boolean } = { clientId }
      if (unreadOnly) {
        where.isRead = false
      }

      const total = await prisma.clientNotification.count({ where })

      const unreadCount = await prisma.clientNotification.count({
        where: { clientId, isRead: false },
      })

      const notifications = await prisma.clientNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          link: true,
          isRead: true,
          createdAt: true,
        },
      })

      const hasMore = offset + limit < total

      return reply.status(200).send({
        notifications: notifications.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
        })),
        total,
        unreadCount,
        hasMore,
      })
    },
  )
}
