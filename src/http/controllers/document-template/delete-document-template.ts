import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { deleteObject } from '@/lib/r2'

export const deleteDocumentTemplate: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/document-templates/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'Delete a custom document template',
        operationId: 'deleteDocumentTemplate',
        params: z.object({ id: z.string() }),
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const { id } = request.params

      const existing = await prisma.documentTemplate.findFirst({
        where: { id, isSystem: false },
      })

      if (!existing) {
        throw new ResourceNotFoundException(
          'Template não encontrado ou é de sistema',
        )
      }

      if (existing.fileKey) {
        await deleteObject(existing.fileKey).catch(() => {})
      }

      await prisma.documentTemplate.delete({ where: { id } })

      return reply.status(204).send(null)
    },
  )
}
