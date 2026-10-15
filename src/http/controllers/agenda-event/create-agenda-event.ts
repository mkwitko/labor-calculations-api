import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'

export const createAgendaEvent: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/agenda-events',
    {
      preHandler: [auth],
      schema: {
        tags: ['AgendaEvent'],
        summary: 'Create agenda event',
        operationId: 'createAgendaEvent',
        body: z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          location: z.string().optional(),
          startsAt: z.string().datetime(),
          endsAt: z.string().datetime().optional(),
          allDay: z.boolean().optional(),
          remindEmail: z.boolean().optional(),
        }),
        response: {
          201: z.object({ id: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const {
        title,
        description,
        location,
        startsAt,
        endsAt,
        allDay,
        remindEmail,
      } = request.body

      const event = await prisma.agendaEvent.create({
        data: {
          userId,
          organizationId: requireOrganizationId(),
          title,
          description,
          location,
          startsAt: new Date(startsAt),
          endsAt: endsAt ? new Date(endsAt) : null,
          allDay: allDay ?? false,
          remindEmail: remindEmail ?? true,
          source: 'manual',
        },
        select: { id: true },
      })

      return reply.status(201).send({ id: event.id })
    },
  )
}
