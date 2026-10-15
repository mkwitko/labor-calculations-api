import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { issueApiKey } from '@/services/api/api-key-service'
import { assertPlanFeature } from '@/services/billing/plan-features'

export const createApiKey: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/api-keys',
    {
      preHandler: [auth],
      schema: {
        tags: ['ApiKey'],
        summary: 'Create API key',
        operationId: 'createApiKey',
        body: z.object({
          name: z.string().min(1).max(80),
          /**
           * Ausente significa produção: integração que já existe continua
           * mandando só o nome e continua cobrando.
           */
          mode: z.enum(['live', 'test']).default('live'),
        }),
        response: {
          201: z.object({
            id: z.string(),
            name: z.string(),
            prefix: z.string(),
            mode: z.enum(['live', 'test']),
            token: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Chave de API é credencial de faturamento: quem não administra a
      // organização não cria gasto nem porta de entrada.
      assertRole(request.tenant, 'owner', 'admin')
      // Gate na emissão, não na chamada de `/v1`: a chave já emitida continua
      // valendo até ser revogada, e derrubar integração em produção por causa
      // de uma troca de plano seria pior do que a receita que isso protege.
      await assertPlanFeature(request.tenant.organizationId, 'public_api')

      const issued = await issueApiKey({
        organizationId: request.tenant.organizationId,
        createdById: request.user.sub,
        name: request.body.name,
        mode: request.body.mode,
      })

      // O token completo existe só aqui. Nenhuma outra rota o devolve.
      return reply.status(201).send(issued)
    },
  )
}
