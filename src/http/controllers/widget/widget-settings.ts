import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import z from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { assertSameOrganization } from '@/services/tenant/organization-access'
import {
  getWidgetKey,
  issueWidgetKey,
  revokeWidgetKey,
} from '@/services/widget/widget-key'

const settingsResponse = z.object({
  /** Nula quando o widget está desligado. */
  widgetKey: z.string().nullable(),
})

/**
 * Ligar, desligar e rotacionar a chave do widget.
 *
 * Fica em `owner`/`admin`: a chave vai para o HTML do site do escritório e
 * rotacionar derruba o snippet já publicado — é decisão de quem responde pela
 * organização, não de quem opera casos.
 */
export const widgetSettingsRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/organizations/:organizationId/widget-key',
    {
      preHandler: [auth],
      schema: {
        tags: ['Widget'],
        summary: 'Chave do widget da organização',
        operationId: 'getWidgetKey',
        params: z.object({ organizationId: z.string() }),
        response: { 200: settingsResponse },
      },
    },
    async (request, reply) => {
      assertSameOrganization(request.tenant, request.params.organizationId)
      assertRole(request.tenant, 'owner', 'admin')

      return reply
        .status(200)
        .send({ widgetKey: await getWidgetKey(request.tenant.organizationId) })
    },
  )

  app.post(
    '/organizations/:organizationId/widget-key',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['Widget'],
        summary: 'Liga o widget ou troca a chave',
        operationId: 'issueWidgetKey',
        params: z.object({ organizationId: z.string() }),
        response: { 201: settingsResponse },
      },
    },
    async (request, reply) => {
      assertSameOrganization(request.tenant, request.params.organizationId)
      assertRole(request.tenant, 'owner', 'admin')

      const widgetKey = await issueWidgetKey(request.tenant.organizationId)

      return reply.status(201).send({ widgetKey })
    },
  )

  app.delete(
    '/organizations/:organizationId/widget-key',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['Widget'],
        summary: 'Desliga o widget',
        operationId: 'revokeWidgetKey',
        params: z.object({ organizationId: z.string() }),
        response: { 200: settingsResponse },
      },
    },
    async (request, reply) => {
      assertSameOrganization(request.tenant, request.params.organizationId)
      assertRole(request.tenant, 'owner', 'admin')

      await revokeWidgetKey(request.tenant.organizationId)

      return reply.status(200).send({ widgetKey: null })
    },
  )
}
