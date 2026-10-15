import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'

export const getDocumentTemplate: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/document-templates/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'Get document template by id',
        operationId: 'getDocumentTemplate',
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable(),
            type: z.string(),
            isSystem: z.boolean(),
            fileKey: z.string().nullable(),
            currentVersion: z.number(),
            createdAt: z.date(),
            updatedAt: z.date(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      const template = await prisma.documentTemplate.findFirst({
        where: {
          id,
        },
      })

      if (!template) {
        throw new ResourceNotFoundException('Template não encontrado')
      }

      const { updatedAt, ...rest } = template
      return reply.status(200).send({
        ...rest,
        updatedAt: updatedAt ?? new Date(),
      })
    },
  )
}
