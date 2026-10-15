import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { listApiKeys as listApiKeysService } from '@/services/api/api-key-service'

export const listApiKeys: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/api-keys',
    {
      preHandler: [auth],
      schema: {
        tags: ['ApiKey'],
        summary: 'List API keys',
        operationId: 'listApiKeys',
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              prefix: z.string(),
              mode: z.enum(['live', 'test']),
              lastUsedAt: z.string().nullable(),
              revokedAt: z.string().nullable(),
              createdAt: z.string(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin')

      const keys = await listApiKeysService(request.tenant.organizationId)

      return reply.status(200).send(
        keys.map((key) => ({
          id: key.id,
          name: key.name,
          // Só o prefixo. O segredo saiu uma vez, na criação.
          prefix: key.prefix,
          mode: key.mode,
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          revokedAt: key.revokedAt?.toISOString() ?? null,
          createdAt: key.createdAt.toISOString(),
        })),
      )
    },
  )
}
