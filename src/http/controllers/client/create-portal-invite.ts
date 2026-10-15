import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { sendClientPortalInvite } from '@/services/client-portal/send-portal-invite'

export const createPortalInvite: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/clients/:clientId/portal-invite',
    {
      preHandler: [auth],
      schema: {
        tags: ['Client'],
        summary: 'Issue a portal first-access link for the client',
        operationId: 'createClientPortalInvite',
        security: [{ BearerAuth: [] }],
        params: z.object({ clientId: z.string() }),
        response: {
          201: z.object({
            inviteUrl: z.string(),
            emailSent: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { clientId } = request.params

      assertRole(request.tenant, 'owner', 'admin', 'lawyer', 'staff')

      // `Client` é org-wide e o client do Prisma já filtra por organização, então
      // cliente de outro escritório simplesmente não aparece — 404, não 403.
      const client = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: { id: true, organizationId: true },
      })

      if (!client) {
        throw new ResourceNotFoundException('Cliente não encontrado')
      }

      const invite = await sendClientPortalInvite({
        clientId: client.id,
        organizationId: client.organizationId,
      })

      return reply.status(201).send(invite)
    },
  )
}
