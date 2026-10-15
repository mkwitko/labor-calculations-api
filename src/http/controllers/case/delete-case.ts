import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertCaseWritable } from '@/services/tenant/case-access'

export const deleteCase: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/cases/:caseId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Delete case (soft)',
        operationId: 'deleteCase',
        params: z.object({ caseId: z.string() }),
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      await assertCaseWritable(request.tenant, caseId)

      await prisma.case.update({
        where: { id: caseId },
        data: { deletedAt: new Date() },
      })

      return reply.status(204).send()
    },
  )
}
