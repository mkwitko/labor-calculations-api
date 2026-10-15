import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { calculationVisibility } from '@/services/tenant/visibility'

export const deleteSettlement: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/settlements/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlements'],
        summary: 'Delete settlement',
        operationId: 'deleteSettlement',
        params: z.object({
          id: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params

      assertRole(request.tenant, 'owner', 'admin', 'lawyer')

      const existing = await prisma.settlement.findFirst({
        where: {
          id,
          laborCalculation: calculationVisibility(request.tenant),
        },
      })

      if (!existing) {
        return reply.status(404).send({ message: 'Settlement not found' })
      }

      await prisma.settlement.delete({
        where: { id },
      })

      return reply.status(204).send()
    },
  )
}
