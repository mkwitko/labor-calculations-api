import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { calculationVisibility } from '@/services/tenant/visibility'
import { recordActivity } from '@/utils/record-activity'

export const updateSettlement: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/settlements/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlements'],
        summary: 'Update settlement status',
        operationId: 'updateSettlement',
        params: z.object({
          id: z.string(),
        }),
        body: z.object({
          status: z.enum($Enums.SettlementStatus),
        }),
        response: {
          200: z.object({ id: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { status } = request.body
      const userId = request.user.sub

      assertRole(request.tenant, 'owner', 'admin', 'lawyer')

      const existing = await prisma.settlement.findFirst({
        where: {
          id,
          laborCalculation: calculationVisibility(request.tenant),
        },
        select: { id: true, laborCalculation: { select: { caseId: true } } },
      })

      if (!existing) {
        return reply.status(404).send({ message: 'Settlement not found' })
      }

      const settlement = await prisma.settlement.update({
        where: { id },
        data: {
          status,
          settledAt: status === 'accepted' ? new Date() : null,
        },
      })

      const caseId = existing.laborCalculation.caseId
      if (caseId) {
        await recordActivity({
          caseId,
          userId,
          kind: 'settlement_updated',
          payload: { settlementId: settlement.id, status },
        })
      }

      return reply.status(200).send({ id: settlement.id })
    },
  )
}
