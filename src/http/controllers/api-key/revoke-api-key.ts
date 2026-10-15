import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { revokeApiKey as revokeApiKeyService } from '@/services/api/api-key-service'

export const revokeApiKey: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/api-keys/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['ApiKey'],
        summary: 'Revoke API key',
        operationId: 'revokeApiKey',
        params: z.object({ id: z.string() }),
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin')

      await revokeApiKeyService({
        organizationId: request.tenant.organizationId,
        apiKeyId: request.params.id,
      })

      return reply.status(204).send(null)
    },
  )
}
