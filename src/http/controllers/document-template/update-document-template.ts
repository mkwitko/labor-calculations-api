import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'

export const updateDocumentTemplate: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/document-templates/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'Update a custom document template',
        operationId: 'updateDocumentTemplate',
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
        }),
        response: {
          200: z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable(),
            type: z.string(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const { id } = request.params
      const { name, description } = request.body

      const existing = await prisma.documentTemplate.findFirst({
        where: { id, isSystem: false },
      })

      if (!existing) {
        throw new ResourceNotFoundException(
          'Template não encontrado ou é de sistema',
        )
      }

      const template = await prisma.documentTemplate.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
        },
      })

      return reply.status(200).send(template)
    },
  )
}
