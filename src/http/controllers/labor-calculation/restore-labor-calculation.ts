import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { calculationVisibility } from '@/services/tenant/visibility'

export const restoreLaborCalculation: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/labor-calculation/:id/restore',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Restore deleted labor calculation',
        operationId: 'restoreLaborCalculation',
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      const existing = await prisma.laborCalculation.findFirst({
        where: {
          id,
          ...calculationVisibility(request.tenant),
          deletedAt: { not: null },
        },
        select: { id: true },
      })

      if (!existing) throw new ResourceNotFoundException()

      await prisma.laborCalculation.update({
        where: { id },
        data: { deletedAt: null },
      })

      return reply.status(200).send({ id })
    },
  )
}
