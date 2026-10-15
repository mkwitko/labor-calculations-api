import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import { auth } from '@/http/hooks/auth'

export const deleteUser: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/users/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['User'],
        summary: 'Soft delete a user',
        security: [{ BearerAuth: [] }],
        operationId: 'deleteUser',
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            deletedAt: z.date().nullable(),
          }),
          403: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.sub

      if (id !== userId) {
        throw new ForbiddenException('You can only delete your own account')
      }

      const existing = await prisma.user.findUnique({ where: { id } })
      if (!existing) {
        return reply.status(404).send({ message: 'User not found' })
      }

      if (existing.deletedAt) {
        return reply
          .status(200)
          .send({ id: existing.id, deletedAt: existing.deletedAt })
      }

      const deletedUser = await prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      return reply.status(200).send({
        id: deletedUser.id,
        deletedAt: deletedUser.deletedAt,
      })
    },
  )
}
