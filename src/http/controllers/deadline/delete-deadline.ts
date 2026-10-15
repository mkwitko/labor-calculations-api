import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { caseRelationVisibility } from '@/services/tenant/visibility'

export const deleteDeadline: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/deadlines/:deadlineId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Deadline'],
        summary: 'Delete deadline',
        operationId: 'deleteDeadline',
        params: z.object({ deadlineId: z.string() }),
        response: { 204: z.void() },
      },
    },
    async (request, reply) => {
      const { deadlineId } = request.params

      const deadline = await prisma.deadline.findFirst({
        where: { id: deadlineId, case: caseRelationVisibility(request.tenant) },
        select: { id: true, caseId: true },
      })
      if (!deadline) throw new ResourceNotFoundException('Prazo não encontrado')

      await assertCaseWritable(request.tenant, deadline.caseId)

      await prisma.deadline.delete({ where: { id: deadlineId } })

      return reply.status(204).send()
    },
  )
}
