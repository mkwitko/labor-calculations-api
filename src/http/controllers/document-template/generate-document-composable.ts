import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { generateDocumentComposable } from '@/services/document/generate-document-service'

// Canonical generation endpoint: build a document from any combination of
// calculation / case / client. A calculation auto-resolves its linked case
// and client. Supersedes POST /labor-calculation/:id/generate-document.
export const generateDocumentComposableController: FastifyPluginCallbackZod = (
  app,
) => {
  app.post(
    '/document-templates/:id/generate',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['DocumentTemplate'],
        summary:
          'Generate a document from a template (calculation/case/client)',
        operationId: 'generateDocumentFromTemplate',
        params: z.object({ id: z.string() }),
        body: z.object({
          calculationId: z.string().optional(),
          caseId: z.string().optional(),
          clientId: z.string().optional(),
        }),
        response: {
          200: z.object({
            downloadUrl: z.string(),
            fileName: z.string(),
            fileKey: z.string(),
          }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { calculationId, caseId, clientId } = request.body

      try {
        const result = await generateDocumentComposable({
          actor: request.tenant,
          templateId: id,
          calculationId,
          caseId,
          clientId,
        })
        return reply.status(200).send(result)
      } catch (err) {
        if (err instanceof ResourceNotFoundException) {
          return reply.status(404).send({ message: err.message })
        }
        throw err
      }
    },
  )
}
