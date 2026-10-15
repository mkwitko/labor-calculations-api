import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'
import { syncExtraMembers } from '@/services/billing/sync-extra-members'
import { syncMemberCount } from '@/services/billing/sync-members'
import type { TenantActor } from '@/services/tenant/actor'
import {
  assertManageMembers,
  assertSameOrganization,
  findActiveMembership,
} from '@/services/tenant/organization-access'

/**
 * `owner` fora do enum é o gate mais forte que um `if`: papel inválido não
 * chega ao handler, o Zod devolve 400. Titularidade muda só por
 * `POST /organizations/:id/transfer-ownership`.
 */
const ASSIGNABLE_ROLE = z.enum(['admin', 'lawyer', 'staff', 'intern'])

const organizationParams = z.object({ organizationId: z.string() })

const membershipParams = z.object({
  organizationId: z.string(),
  membershipId: z.string(),
})

function requireTenant(tenant: TenantActor | undefined): TenantActor {
  if (!tenant) throw new UnauthorizedException()

  return tenant
}

export const memberRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/organizations/:organizationId/members',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'List active members of the organization',
        security: [{ BearerAuth: [] }],
        operationId: 'listOrganizationMembers',
        params: organizationParams,
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string(),
                role: z.enum(['owner', 'admin', 'lawyer', 'staff', 'intern']),
                createdAt: z.date(),
                user: z.object({
                  id: z.string(),
                  name: z.string(),
                  mail: z.string(),
                  oabNumber: z.string().nullable(),
                }),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)
      assertSameOrganization(tenant, request.params.organizationId)
      assertManageMembers(tenant)

      const members = await systemPrisma.membership.findMany({
        where: { organizationId: tenant.organizationId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, mail: true, oabNumber: true },
          },
        },
      })

      return reply.status(200).send({ data: members })
    },
  )

  app.patch(
    '/organizations/:organizationId/members/:membershipId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: "Change a member's role",
        security: [{ BearerAuth: [] }],
        operationId: 'updateMemberRole',
        params: membershipParams,
        body: z.object({ role: ASSIGNABLE_ROLE }),
        response: {
          200: z.object({
            data: z.object({ id: z.string(), role: ASSIGNABLE_ROLE }),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)
      const { organizationId, membershipId } = request.params

      assertSameOrganization(tenant, organizationId)
      assertManageMembers(tenant)

      const target = await findActiveMembership(
        tenant.organizationId,
        membershipId,
      )

      if (!target) {
        throw new ResourceNotFoundException('Membro não encontrado')
      }

      if (target.userId === tenant.userId) {
        throw new ForbiddenException('Você não pode alterar seu próprio papel')
      }

      // Fecha o caminho do admin rebaixando o titular para tomar a
      // organização. Titularidade se move apenas por transferência, e só o
      // próprio titular a inicia.
      if (target.role === 'owner') {
        throw new ForbiddenException(
          'A titularidade muda apenas por transferência',
        )
      }

      const updated = await systemPrisma.membership.update({
        where: { id: target.id },
        data: { role: request.body.role },
        select: { id: true, role: true },
      })

      return reply.status(200).send({
        data: { id: updated.id, role: ASSIGNABLE_ROLE.parse(updated.role) },
      })
    },
  )

  app.delete(
    '/organizations/:organizationId/members/:membershipId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'Remove a member from the organization',
        security: [{ BearerAuth: [] }],
        operationId: 'removeMember',
        params: membershipParams,
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)
      const { organizationId, membershipId } = request.params

      assertSameOrganization(tenant, organizationId)
      assertManageMembers(tenant)

      const target = await findActiveMembership(
        tenant.organizationId,
        membershipId,
      )

      if (!target) {
        throw new ResourceNotFoundException('Membro não encontrado')
      }

      if (target.userId === tenant.userId) {
        throw new ForbiddenException(
          'Para sair da organização use DELETE /organizations/:organizationId/members/me',
        )
      }

      if (target.role === 'owner') {
        throw new ForbiddenException(
          'O titular não pode ser removido; transfira a titularidade primeiro',
        )
      }

      await systemPrisma.membership.update({
        where: { id: target.id },
        data: { deletedAt: new Date() },
      })

      await syncMemberCount(tenant.organizationId)
      // Entrou ou saiu gente: o excedente do teto é recalculado do zero.
      await syncExtraMembers(tenant.organizationId)

      return reply.status(204).send()
    },
  )

  // O segmento literal `me` tem prioridade sobre `:membershipId` no roteador
  // do Fastify, então a ordem de registro aqui é indiferente — vale registrar
  // que isso é garantia do roteador, não coincidência.
  app.delete(
    '/organizations/:organizationId/members/me',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'Leave the organization',
        security: [{ BearerAuth: [] }],
        operationId: 'leaveOrganization',
        params: organizationParams,
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)

      assertSameOrganization(tenant, request.params.organizationId)

      // Sem gate de papel: qualquer membro sai. O titular é a exceção, porque
      // uma organização sem titular não tem quem responda por billing.
      if (tenant.role === 'owner') {
        throw new ConflictException(
          'Transfira a titularidade antes de sair da organização',
        )
      }

      await systemPrisma.membership.updateMany({
        where: {
          userId: tenant.userId,
          organizationId: tenant.organizationId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      })

      await syncMemberCount(tenant.organizationId)
      // Entrou ou saiu gente: o excedente do teto é recalculado do zero.
      await syncExtraMembers(tenant.organizationId)

      return reply.status(204).send()
    },
  )
}
