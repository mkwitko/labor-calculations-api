import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { generateDocumentFromTemplate } from '@/services/document/generate-document-service'

export const generateDocument: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/labor-calculation/:id/generate-document',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Generate document from template using calculation data',
        operationId: 'generateDocument',
        params: z.object({ id: z.string() }),
        body: z.object({
          templateId: z.string(),
        }),
        response: {
          200: z.object({
            downloadUrl: z.string(),
            fileName: z.string(),
            fileKey: z.string(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { templateId } = request.body

      try {
        const result = await generateDocumentFromTemplate({
          calculationId: id,
          templateId,
          actor: request.tenant,
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
