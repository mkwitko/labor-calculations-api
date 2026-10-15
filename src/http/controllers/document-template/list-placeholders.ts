import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import {
  PLACEHOLDER_REGISTRY,
  REQUIRED_PLACEHOLDERS_BY_TYPE,
} from '@/services/document/placeholder-registry'

// Exposes the placeholder registry to the front so it renders the "insert
// field" panel and required-by-type badges from a single source of truth.
export const listPlaceholders: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/document-templates/placeholders',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'List all available template placeholders',
        operationId: 'listTemplatePlaceholders',
        response: {
          200: z.object({
            placeholders: z.array(
              z.object({
                key: z.string(),
                label: z.string(),
                description: z.string(),
                group: z.string(),
                source: z.string(),
                example: z.string(),
              }),
            ),
            requiredByType: z.record(z.string(), z.array(z.string())),
          }),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({
        placeholders: PLACEHOLDER_REGISTRY.map((p) => ({
          key: p.key,
          label: p.label,
          description: p.description,
          group: p.group,
          source: p.source,
          example: p.example,
        })),
        requiredByType: REQUIRED_PLACEHOLDERS_BY_TYPE,
      })
    },
  )
}
