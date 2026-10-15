import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'

export const deleteClient: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/clients/:clientId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Client'],
        summary: 'Delete client',
        operationId: 'deleteClient',
        params: z.object({ clientId: z.string() }),
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin', 'lawyer', 'staff')
      const { clientId } = request.params

      const existing = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: { id: true },
      })

      if (!existing)
        throw new ResourceNotFoundException('Cliente não encontrado')

      await prisma.client.update({
        where: { id: clientId },
        data: { deletedAt: new Date() },
      })

      return reply.status(204).send()
    },
  )
}
