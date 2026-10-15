import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { assertSameOrganization } from '@/services/tenant/organization-access'

export const transferOwnership: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/organizations/:organizationId/transfer-ownership',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'Transfer ownership of the organization',
        security: [{ BearerAuth: [] }],
        operationId: 'transferOwnership',
        params: z.object({ organizationId: z.string() }),
        body: z.object({ userId: z.string() }),
        response: {
          200: z.object({
            data: z.object({
              ownerUserId: z.string(),
              previousOwnerRole: z.literal('admin'),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = request.tenant

      if (!tenant) throw new UnauthorizedException()

      assertSameOrganization(tenant, request.params.organizationId)

      // Admin administra gente, mas não passa a chave: só o titular inicia a
      // transferência da própria titularidade.
      assertRole(tenant, 'owner')

      const { userId } = request.body

      if (userId === tenant.userId) {
        throw new BadRequestException('Você já é o titular')
      }

      const target = await systemPrisma.membership.findFirst({
        where: {
          userId,
          organizationId: tenant.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      })

      if (!target) {
        throw new ResourceNotFoundException('Membro não encontrado')
      }

      const current = await systemPrisma.membership.findFirstOrThrow({
        where: {
          userId: tenant.userId,
          organizationId: tenant.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      })

      // Uma transação, dois updates: entre eles a organização teria dois
      // titulares ou nenhum, e `findOwnedOrganization`/`findOrganizationOwner`
      // (owned-organization.ts) leem "owner ativo mais antigo primeiro" —
      // ambíguo se a janela existir.
      await systemPrisma.$transaction([
        systemPrisma.membership.update({
          where: { id: target.id },
          data: { role: 'owner' },
        }),
        systemPrisma.membership.update({
          where: { id: current.id },
          data: { role: 'admin' },
        }),
      ])

      // O antigo titular fica `admin`, não é removido: sair é um segundo ato,
      // explícito, por `DELETE /organizations/:organizationId/members/me`.
      return reply.status(200).send({
        data: { ownerUserId: userId, previousOwnerRole: 'admin' as const },
      })
    },
  )
}
