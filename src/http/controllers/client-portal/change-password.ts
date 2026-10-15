import { hash, verify } from 'argon2'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { clientAuth } from '@/http/hooks/client-auth'

export const changeClientPassword: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/client-portal/change-password',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Client portal change password',
        operationId: 'changeClientPassword',
        security: [{ BearerAuth: [] }],
        body: z.object({
          currentPassword: z.string().min(1),
          newPassword: z
            .string()
            .min(8, 'Senha deve ter no mínimo 8 caracteres')
            .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
            .regex(/\d/, 'Senha deve conter pelo menos um número'),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const clientId = request.user.sub

      const client = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: { password: true, document: true },
      })

      if (!client?.password) {
        throw new BadRequestException('Credenciais inválidas')
      }

      const isValid = await verify(
        client.password,
        request.body.currentPassword,
      )
      if (!isValid) {
        throw new BadRequestException('Senha atual incorreta')
      }

      // Validate password is not same as CPF
      if (client.document && request.body.newPassword === client.document) {
        throw new BadRequestException('Senha não pode ser igual ao CPF')
      }

      const hashedPassword = await hash(request.body.newPassword)
      await prisma.client.update({
        where: { id: clientId },
        data: { password: hashedPassword, mustChangePassword: false },
      })

      return reply.status(200).send({
        message: 'Senha alterada com sucesso',
      })
    },
  )
}
