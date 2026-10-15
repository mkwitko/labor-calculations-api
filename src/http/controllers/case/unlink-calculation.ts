import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { calculationVisibility } from '@/services/tenant/visibility'
import { recordActivity } from '@/utils/record-activity'

export const unlinkCalculationFromCase: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/cases/:caseId/calculations/:calcId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Unlink calculation from case',
        operationId: 'unlinkCalculationFromCase',
        params: z.object({ caseId: z.string(), calcId: z.string() }),
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { caseId, calcId } = request.params

      await assertCaseWritable(request.tenant, caseId)

      const existingCalc = await prisma.laborCalculation.findFirst({
        where: {
          id: calcId,
          caseId,
          ...calculationVisibility(request.tenant),
          deletedAt: null,
        },
        select: { id: true },
      })

      if (!existingCalc)
        throw new ResourceNotFoundException('Cálculo não encontrado neste caso')

      await prisma.laborCalculation.update({
        where: { id: calcId },
        data: { caseId: null },
      })

      await recordActivity({
        caseId,
        userId,
        kind: 'calc_unlinked',
        payload: { calcId },
      })

      return reply.status(200).send({ id: calcId })
    },
  )
}
