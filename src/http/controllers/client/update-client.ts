import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'

export const updateClient: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/clients/:clientId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Client'],
        summary: 'Update client',
        operationId: 'updateClient',
        params: z.object({ clientId: z.string() }),
        body: z.object({
          name: z.string().min(2).optional(),
          document: z.string().optional(),
          mail: z.string().email().optional(),
          phone: z.string().optional(),
          notes: z.string().optional(),
        }),
        response: {
          200: z.object({ id: z.string() }),
        },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin', 'lawyer', 'staff')
      const { clientId } = request.params
      const { name, document, mail, phone, notes } = request.body

      const existing = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: { id: true },
      })

      if (!existing)
        throw new ResourceNotFoundException('Cliente não encontrado')

      if (document) {
        const conflict = await prisma.client.findFirst({
          where: {
            document,
            id: { not: clientId },
            deletedAt: null,
          },
          select: { id: true },
        })
        if (conflict)
          throw new ConflictException('Já existe um cliente com esse CPF')
      }

      if (mail) {
        const mailConflict = await prisma.client.findFirst({
          where: {
            mail,
            id: { not: clientId },
            deletedAt: null,
          },
          select: { id: true },
        })
        if (mailConflict)
          throw new ConflictException(
            'Já existe um cliente com esse e-mail neste escritório',
          )
      }

      await prisma.client.update({
        where: { id: clientId },
        data: { name, document, mail, phone, notes },
      })

      return reply.status(200).send({ id: clientId })
    },
  )
}
