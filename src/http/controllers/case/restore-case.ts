import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { caseVisibility } from '@/services/tenant/visibility'

export const restoreCase: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/restore',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Restore deleted case',
        operationId: 'restoreCase',
        params: z.object({ caseId: z.string() }),
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      const existing = await prisma.case.findFirst({
        where: {
          id: caseId,
          ...caseVisibility(request.tenant),
          deletedAt: { not: null },
        },
        select: { id: true },
      })

      if (!existing) throw new ResourceNotFoundException('Caso não encontrado')

      await prisma.case.update({
        where: { id: caseId },
        data: { deletedAt: null },
      })

      return reply.status(200).send({ id: caseId })
    },
  )
}
