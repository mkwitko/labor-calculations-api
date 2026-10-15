import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'

export const deleteAgendaEvent: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/agenda-events/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['AgendaEvent'],
        summary: 'Delete agenda event',
        operationId: 'deleteAgendaEvent',
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { id } = request.params

      const existing = await prisma.agendaEvent.findFirst({
        where: { id, userId },
        select: { id: true },
      })
      if (!existing)
        throw new ResourceNotFoundException('Evento não encontrado')

      await prisma.agendaEvent.delete({ where: { id } })

      return reply.status(204).send()
    },
  )
}
