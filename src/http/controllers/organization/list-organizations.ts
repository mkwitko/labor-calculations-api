import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'

export const listOrganizations: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/organizations',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'List organizations the authenticated user belongs to',
        security: [{ BearerAuth: [] }],
        operationId: 'listOrganizations',
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string(),
                logoUrl: z.string().nullable(),
                seats: z.number(),
                role: z.enum(['owner', 'admin', 'lawyer', 'staff', 'intern']),
                isCurrent: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = request.tenant

      if (!tenant) throw new UnauthorizedException()

      // `Membership` é non-tenant: a lista é da pessoa, não da organização
      // ativa. Filtrar por `organizationId` aqui devolveria sempre um item e
      // tornaria o switcher inútil.
      const memberships = await systemPrisma.membership.findMany({
        where: { userId: tenant.userId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              seats: true,
            },
          },
        },
      })

      return reply.status(200).send({
        data: memberships.map(({ role, organization }) => ({
          ...organization,
          role,
          isCurrent: organization.id === tenant.organizationId,
        })),
      })
    },
  )
}
