import { hash } from 'argon2'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { consumeClientAccessToken } from '@/services/client-portal/client-access-token'

export const resetPassword: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/reset-password',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minute',
        },
      },
      schema: {
        tags: ['ClientPortal'],
        summary: 'Reset password with token',
        operationId: 'resetPasswordClient',
        body: z.object({
          token: z.string().min(1),
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
      const { token, newPassword } = request.body

      // O token identifica o cliente — não há `clientId` no corpo de propósito:
      // aceitar o id de fora deixaria quem tem um token trocar a senha de
      // outra pessoa. `Client` é modelo tenant e aqui não há contexto de
      // organização, então a escrita usa `systemPrisma`.
      const resolved = await consumeClientAccessToken(token, 'reset')

      if (!resolved) {
        throw new BadRequestException(
          'Link inválido ou expirado. Solicite um novo.',
        )
      }

      const client = await systemPrisma.client.findFirst({
        where: { id: resolved.clientId, deletedAt: null },
        select: { id: true, document: true },
      })

      if (!client) {
        throw new BadRequestException('Link inválido ou expirado')
      }

      if (client.document && newPassword === client.document) {
        throw new BadRequestException('Senha não pode ser igual ao CPF')
      }

      await systemPrisma.client.update({
        where: { id: client.id },
        data: {
          password: await hash(newPassword),
          mustChangePassword: false,
          loginAttempts: 0,
          lockedUntil: null,
        },
      })

      return reply.status(200).send({
        message: 'Senha redefinida com sucesso. Você já pode fazer login.',
      })
    },
  )
}
