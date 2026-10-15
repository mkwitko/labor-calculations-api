import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { claimWidgetCalculation } from '@/services/public-calculation/claim-public-calculation'
import { listWidgetCalculations } from '@/services/widget/list-widget-calculations'

export const listWidgetCalculationsRoute: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/widget/calculations',
    {
      preHandler: [auth],
      schema: {
        tags: ['Widget'],
        summary: 'Cálculos que chegaram pelo widget do escritório',
        operationId: 'listWidgetCalculations',
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              kind: z.string(),
              perspective: z.string(),
              floor: z.number(),
              ceiling: z.number(),
              name: z.string().nullable(),
              email: z.string().nullable(),
              phone: z.string().nullable(),
              hostSite: z.string().nullable(),
              createdAt: z.date(),
              expiresAt: z.date(),
              claimed: z.boolean(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      // Todo papel que já vê cálculos vê a fila do widget; o que muda por papel
      // é poder importar, e isso a rota de importação cobra.
      return reply
        .status(200)
        .send(await listWidgetCalculations(request.tenant.organizationId))
    },
  )
}

export const claimWidgetCalculationRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/widget/calculations/:id/claim',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['Widget'],
        summary: 'Importa um cálculo do widget para a organização',
        operationId: 'claimWidgetCalculation',
        params: z.object({ id: z.string() }),
        // Corpo ausente chega como `null` (não `undefined`), então `.default()`
        // sozinho não pegaria: daí o `nullish` com transform.
        body: z
          .object({
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
      // Mesma régua do claim por link e do `POST /labor-calculation/v3`:
      // estagiário não cria cliente nem liquidação.
      assertRole(request.tenant, 'owner', 'admin', 'lawyer')

      const result = await claimWidgetCalculation({
        publicCalculationId: request.params.id,
        userId: request.user.sub,
        organizationId: request.tenant.organizationId,
        invitePortal: request.body.invitePortal,
      })

      return reply.status(201).send(result)
    },
  )
}
