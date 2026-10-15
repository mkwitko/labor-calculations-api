import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import z from 'zod'
import { auth } from '@/http/hooks/auth'
import { calculationVisibility } from '@/services/tenant/visibility'

export const shareLaborCalculation: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/labor-calculation/:id/share',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Set share code for labor calculation',
        operationId: 'shareLaborCalculation',
        params: z.object({
          id: z.string(),
        }),
        body: z.object({
          shareCode: z.string().min(1),
        }),
        response: {
          204: z.void(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { shareCode } = request.body

      const calculation = await prisma.laborCalculation.findFirst({
        where: { id, ...calculationVisibility(request.tenant) },
        select: { id: true },
      })

      if (!calculation) {
        return reply.status(404).send({ message: 'Not found' })
      }

      await prisma.laborCalculation.update({
        where: { id },
        data: { shareCode },
      })

      return reply.status(204).send()
    },
  )
}
