import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { claimPublicCalculation } from '@/services/public-calculation/claim-public-calculation'

export const claimPublicCalculationRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/public/calculations/:token/claim',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['Public'],
        summary: 'Importa um cálculo público para a organização do advogado',
        operationId: 'claimPublicCalculation',
        params: z.object({ token: z.string().min(10).max(200) }),
        // Corpo ausente chega como `null` (não `undefined`), então `.default()`
        // sozinho não pegaria: daí o `nullish` com transform.
        body: z
          .object({
            /** Convidar o consumidor para o portal. Padrão: sim. */
            invitePortal: z.boolean().optional(),
          })
          .nullish()
          .transform((value) => ({
            invitePortal: value?.invitePortal ?? true,
          })),
        response: {
          201: z.object({
            calculationId: z.string(),
            clientId: z.string(),
            created: z.boolean(),
            portalInviteUrl: z.string().nullable(),
            portalEmailSent: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Estagiário não cria cliente nem liquidação — mesma régua do
      // `POST /labor-calculation/v3`.
      assertRole(request.tenant, 'owner', 'admin', 'lawyer')

      const result = await claimPublicCalculation({
        token: request.params.token,
        userId: request.user.sub,
        organizationId: request.tenant.organizationId,
        invitePortal: request.body.invitePortal,
      })

      return reply.status(201).send(result)
    },
  )
}
