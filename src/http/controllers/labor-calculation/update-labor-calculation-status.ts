import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import z from 'zod'
import { auth } from '@/http/hooks/auth'
import { recordAudit } from '@/services/audit/audit-log'
import { calculationVisibility } from '@/services/tenant/visibility'

export const updateLaborCalculationStatus: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/labor-calculation/:id/status',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Update labor calculation status',
        operationId: 'updateLaborCalculationStatus',
        params: z.object({
          id: z.string(),
        }),
        body: z.object({
          status: z.enum($Enums.CalculationStatus),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { status } = request.body

      const existing = await prisma.laborCalculation.findFirst({
        where: { id, ...calculationVisibility(request.tenant) },
        select: { id: true, status: true },
      })

      if (!existing) {
        return reply.status(404).send({ message: 'Not found' })
      }

      await prisma.laborCalculation.update({
        where: { id },
        data: { status },
      })

      await recordAudit({
        entityType: 'LaborCalculation',
        entityId: id,
        action: 'status_change',
        userId: request.tenant.userId,
        changes: { status: { from: existing.status, to: status } },
      })

      return reply.status(204).send()
    },
  )
}
