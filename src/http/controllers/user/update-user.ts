import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma, systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'

const updateUserSchema = z.object({
  name: z.string().optional(),
  document: z.string().optional(),
  officeName: z.string().optional(),
  oabNumber: z.string().optional(),
  phone: z.string().optional(),
  logoUrl: z.string().url().or(z.literal('')).optional(),
  address: z.string().optional(),
  website: z.string().url().or(z.literal('')).optional(),
  bio: z.string().optional(),
  brandPrimaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  letterheadUrl: z.string().url().or(z.literal('')).nullable().optional(),
})

export const updateUser: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/users/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['User'],
        summary: "Update a user's data",
        security: [{ BearerAuth: [] }],
        operationId: 'updateUser',
        params: z.object({ id: z.string() }),
        body: updateUserSchema,
        response: {
          200: z.object({ id: z.string() }),
          403: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.sub

      if (id !== userId) {
        throw new ForbiddenException('You can only update your own profile')
      }

      const {
        name,
        document,
        officeName,
        oabNumber,
        phone,
        logoUrl,
        address,
        website,
        bio,
        brandPrimaryColor,
        letterheadUrl,
      } = request.body

      const existing = await prisma.user.findUnique({ where: { id } })
      if (!existing) {
        return reply.status(404).send({ message: 'User not found' })
      }

      // Identidade visual do escritório (papel timbrado, logotipo, cor,
      // telefone, endereço, site) pertence à Organization, não à pessoa —
      // dois advogados do mesmo escritório compartilham o mesmo timbre.
      const brandingUpdate = {
        ...(officeName !== undefined && { name: officeName }),
        ...(phone !== undefined && { phone }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(address !== undefined && { address }),
        ...(website !== undefined && { website }),
        ...(brandPrimaryColor !== undefined && { brandPrimaryColor }),
        ...(letterheadUrl !== undefined && { letterheadUrl }),
      }

      if (Object.keys(brandingUpdate).length > 0) {
        assertRole(request.tenant, 'owner', 'admin')

        // `Organization` não é modelo tenant — `systemPrisma` por
        // consistência com `organization-branding.ts` (o client escopado
        // funcionaria de forma idêntica aqui).
        await systemPrisma.organization.update({
          where: { id: request.tenant.organizationId },
          data: brandingUpdate,
        })
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        select: { id: true },
        data: {
          ...(name !== undefined && { name }),
          ...(document !== undefined && { document }),
          ...(oabNumber !== undefined && { oabNumber }),
          ...(bio !== undefined && { bio }),
        },
      })

      return reply.status(200).send(updatedUser)
    },
  )
}
