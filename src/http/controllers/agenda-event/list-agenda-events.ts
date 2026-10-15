import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'

export const listAgendaEvents: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/agenda-events',
    {
      preHandler: [auth],
      schema: {
        tags: ['AgendaEvent'],
        summary: 'List agenda events',
        operationId: 'listAgendaEvents',
        querystring: z.object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                description: z.string().nullable(),
                location: z.string().nullable(),
                startsAt: z.date(),
                endsAt: z.date().nullable(),
                allDay: z.boolean(),
                doneAt: z.date().nullable(),
                remindEmail: z.boolean(),
                source: z.enum(['manual', 'google']),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const userId = request.user.sub
      const { from, to } = request.query

      const events = await prisma.agendaEvent.findMany({
        where: {
          userId,
          ...(from || to
            ? {
                startsAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          startsAt: true,
          endsAt: true,
          allDay: true,
          doneAt: true,
          remindEmail: true,
          source: true,
        },
      })

      return { data: events }
    },
  )
}
