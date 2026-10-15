import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'

export const getClient: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/clients/:clientId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Client'],
        summary: 'Get client',
        operationId: 'getClient',
        params: z.object({ clientId: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            name: z.string(),
            document: z.string().nullable(),
            mail: z.string().nullable(),
            phone: z.string().nullable(),
            notes: z.string().nullable(),
            createdAt: z.date(),
            updatedAt: z.date(),
            _count: z.object({ laborCalculations: z.number() }),
          }),
        },
      },
    },
    async (request) => {
      const { clientId } = request.params

      const client = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: {
          id: true,
          name: true,
          document: true,
          mail: true,
          phone: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { laborCalculations: true } },
        },
      })

      if (!client) throw new ResourceNotFoundException('Cliente não encontrado')

      return client
    },
  )
}
