import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'
import { brandingForOrganization } from '@/services/tenant/organization-branding'

export const getAuthenticatedUser: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/users/me',
    {
      preHandler: [auth],
      schema: {
        tags: ['User'],
        summary: 'Get authenticated user',
        security: [{ BearerAuth: [] }],
        operationId: 'getAuthenticatedUser',
        response: {
          200: z.object({
            data: z.object({
              id: z.string(),
              name: z.string(),
              mail: z.string(),
              document: z.string().nullable(),
              officeName: z.string().nullable(),
              oabNumber: z.string().nullable(),
              phone: z.string().nullable(),
              logoUrl: z.string().nullable(),
              address: z.string().nullable(),
              website: z.string().nullable(),
              bio: z.string().nullable(),
              brandPrimaryColor: z.string().nullable(),
              letterheadUrl: z.string().nullable(),
              isAdmin: z.boolean(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          mail: true,
          document: true,
          oabNumber: true,
          bio: true,
          isAdmin: true,
        },
      })

      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado')
      }

      const branding = await brandingForOrganization(
        request.tenant.organizationId,
      )

      return reply.status(200).send({
        data: {
          ...user,
          officeName: branding?.officeName ?? null,
          phone: branding?.phone ?? null,
          logoUrl: branding?.logoUrl ?? null,
          address: branding?.address ?? null,
          website: branding?.website ?? null,
          brandPrimaryColor: branding?.brandPrimaryColor ?? null,
          letterheadUrl: branding?.letterheadUrl ?? null,
        },
      })
    },
  )
}
