import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'

export const updateAgendaEvent: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/agenda-events/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['AgendaEvent'],
        summary: 'Update agenda event',
        operationId: 'updateAgendaEvent',
        params: z.object({ id: z.string() }),
        body: z.object({
          title: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
          startsAt: z.string().datetime().optional(),
          endsAt: z.string().datetime().nullable().optional(),
          allDay: z.boolean().optional(),
          remindEmail: z.boolean().optional(),
          // Toggle completion — true sets doneAt now, false clears it.
          done: z.boolean().optional(),
        }),
        response: {
          200: z.object({ id: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { id } = request.params
      const {
        title,
        description,
        location,
        startsAt,
        endsAt,
        allDay,
        remindEmail,
        done,
      } = request.body

      const existing = await prisma.agendaEvent.findFirst({
        where: { id, userId },
        select: { id: true },
      })
      if (!existing)
        throw new ResourceNotFoundException('Evento não encontrado')

      await prisma.agendaEvent.update({
        where: { id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(location !== undefined ? { location } : {}),
          ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
          ...(endsAt !== undefined
            ? { endsAt: endsAt ? new Date(endsAt) : null }
            : {}),
          ...(allDay !== undefined ? { allDay } : {}),
          ...(remindEmail !== undefined ? { remindEmail } : {}),
          ...(done !== undefined ? { doneAt: done ? new Date() : null } : {}),
        },
      })

      return reply.status(200).send({ id })
    },
  )
}
