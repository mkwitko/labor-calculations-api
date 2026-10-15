import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { cookieOptions } from '@/http/hooks/auth'
import {
  CLIENT_ACCESS_MAX_AGE_MS,
  CLIENT_ACCESS_TOKEN_EXPIRY,
  clientAuth,
} from '@/http/hooks/client-auth'

/**
 * Troca o escritório ativo do portal sem repetir senha.
 *
 * A autorização é o `linked` do token: as contas do mesmo e-mail cuja senha
 * bateu no login. Conta com senha diferente nunca entra nessa lista, então o
 * caminho dela continua sendo o login — isso aqui não é bypass de senha, é a
 * mesma sessão apontando para outro cadastro que a senha já abriu.
 *
 * `Client` é modelo tenant e a organização ativa muda no meio do caminho, daí
 * `systemPrisma` nas duas consultas.
 */
export const switchClientOrganization: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/switch',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Switch the active office of a client portal session',
        operationId: 'switchClientOrganization',
        body: z.object({ organizationId: z.string() }),
        response: {
          201: z.object({ mustChangePassword: z.boolean() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const linked = request.user.linked ?? []

      const current = await systemPrisma.client.findFirst({
        where: { id: request.user.sub, deletedAt: null },
        select: { id: true, mail: true },
      })

      // 404 e não 403 em todas as recusas: confirmar existência de conta em
      // outro escritório seria oráculo.
      if (!current?.mail) {
        throw new ResourceNotFoundException(
          'Você não tem acesso a esse escritório com este login',
        )
      }

      const target = await systemPrisma.client.findFirst({
        where: {
          id: { in: linked },
          organizationId: request.body.organizationId,
          mail: current.mail,
          deletedAt: null,
          password: { not: null },
        },
        select: { id: true, mustChangePassword: true },
      })

      if (!target) {
        throw new ResourceNotFoundException(
          'Você não tem acesso a esse escritório com este login',
        )
      }

      const accessToken = app.jwt.sign(
        {
          sub: target.id,
          type: 'client',
          // O escritório de onde saímos entra na lista; o de destino sai dela.
          linked: [
            ...linked.filter((clientId) => clientId !== target.id),
            current.id,
          ],
        },
        { expiresIn: CLIENT_ACCESS_TOKEN_EXPIRY },
      )

      reply.setCookie(
        'clientAccessToken',
        accessToken,
        cookieOptions(CLIENT_ACCESS_MAX_AGE_MS),
      )

      return reply
        .status(201)
        .send({ mustChangePassword: target.mustChangePassword })
    },
  )
}
