import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'

export const checkClientAuth: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/check-auth',
    {
      schema: {
        tags: ['ClientPortal'],
        summary: 'Check client portal auth',
        operationId: 'checkClientAuth',
        response: {
          200: z.object({
            isAuthenticated: z.boolean(),
            mustChangePassword: z.boolean().optional(),
            // Escritórios que este login abre. O front mostra o seletor quando
            // vem mais de um.
            organizations: z
              .array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  current: z.boolean(),
                }),
              )
              .optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const cookie = request.cookies.clientAccessToken
      if (!cookie) {
        return reply.status(200).send({ isAuthenticated: false })
      }

      try {
        const payload = app.jwt.verify<{
          sub: string
          type?: string
          linked?: string[]
        }>(cookie)
        if (payload.type !== 'client') {
          return reply.status(200).send({ isAuthenticated: false })
        }

        // This route doesn't go through the clientAuth hook (it must answer
        // even for stale/invalid cookies), so there is no tenant context yet
        // and no other tenant model is touched afterwards. systemPrisma is
        // the correct client here, same reasoning as client-auth.ts.
        const client = await systemPrisma.client.findFirst({
          where: { id: payload.sub, deletedAt: null },
          select: { mustChangePassword: true, organizationId: true },
        })

        if (!client) {
          return reply.status(200).send({ isAuthenticated: false })
        }

        // Conta apagada ou que perdeu a senha depois do login sai da lista: o
        // switch a recusaria de qualquer forma, e oferecê-la seria um 404 na
        // cara do cliente.
        const accounts = await systemPrisma.client.findMany({
          where: {
            id: { in: [payload.sub, ...(payload.linked ?? [])] },
            deletedAt: null,
            password: { not: null },
          },
          select: { organizationId: true },
        })

        const organizationIds = [
          ...new Set([
            client.organizationId,
            ...accounts.map((account) => account.organizationId),
          ]),
        ]

        const organizations = await systemPrisma.organization.findMany({
          where: { id: { in: organizationIds } },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })

        return reply.status(200).send({
          isAuthenticated: true,
          mustChangePassword: client.mustChangePassword,
          organizations: organizations.map((organization) => ({
            id: organization.id,
            name: organization.name,
            current: organization.id === client.organizationId,
          })),
        })
      } catch {
        return reply.status(200).send({ isAuthenticated: false })
      }
    },
  )
}
