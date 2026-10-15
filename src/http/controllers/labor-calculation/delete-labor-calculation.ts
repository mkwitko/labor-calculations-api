import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import z from 'zod'
import { auth } from '@/http/hooks/auth'
import { recordAudit } from '@/services/audit/audit-log'
import { calculationVisibility } from '@/services/tenant/visibility'

export const deleteLaborCalculation: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/labor-calculation/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Delete labor calculation',
        operationId: 'deleteLaborCalculation',
        params: z.object({
          id: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params

      const existing = await prisma.laborCalculation.findFirst({
        where: {
          id,
          ...calculationVisibility(request.tenant),
          deletedAt: null,
        },
        select: { id: true },
      })

      if (!existing) {
        return reply.status(404).send({ message: 'Not found' })
      }

      await prisma.laborCalculation.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      await recordAudit({
        entityType: 'LaborCalculation',
        entityId: id,
        action: 'delete',
        userId: request.tenant.userId,
      })

      return reply.status(204).send()
    },
  )
}
