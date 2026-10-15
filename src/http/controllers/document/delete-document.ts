import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { caseRelationVisibility } from '@/services/tenant/visibility'
import { recordActivity } from '@/utils/record-activity'

export const deleteDocument: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/documents/:documentId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Document'],
        summary: 'Soft-delete a document',
        operationId: 'deleteDocument',
        params: z.object({ documentId: z.string() }),
        response: { 204: z.void() },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { documentId } = request.params

      const doc = await prisma.document.findFirst({
        where: {
          id: documentId,
          case: caseRelationVisibility(request.tenant),
          deletedAt: null,
        },
        select: { id: true, caseId: true },
      })
      if (!doc) throw new ResourceNotFoundException('Documento não encontrado')

      await assertCaseWritable(request.tenant, doc.caseId)

      await prisma.document.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      })

      await recordActivity({
        caseId: doc.caseId,
        userId,
        kind: 'doc_deleted',
        payload: { documentId },
      })

      return reply.status(204).send()
    },
  )
}
