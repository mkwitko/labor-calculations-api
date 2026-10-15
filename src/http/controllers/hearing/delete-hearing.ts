import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { caseRelationVisibility } from '@/services/tenant/visibility'

export const deleteHearing: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/hearings/:hearingId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Hearing'],
        summary: 'Delete hearing',
        operationId: 'deleteHearing',
        params: z.object({ hearingId: z.string() }),
        response: { 204: z.void() },
      },
    },
    async (request, reply) => {
      const { hearingId } = request.params

      const hearing = await prisma.hearing.findFirst({
        where: { id: hearingId, case: caseRelationVisibility(request.tenant) },
        select: { id: true, caseId: true },
      })
      if (!hearing)
        throw new ResourceNotFoundException('Audiência não encontrada')

      await prisma.hearing.delete({ where: { id: hearingId } })

      return reply.status(204).send()
    },
  )
}
