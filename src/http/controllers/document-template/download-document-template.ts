import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { generateDownloadUrl } from '@/lib/r2'

export const downloadDocumentTemplate: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/document-templates/:id/download',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'Get download URL for template .docx file',
        operationId: 'downloadDocumentTemplate',
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({
            downloadUrl: z.string(),
            fileName: z.string(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      const template = await prisma.documentTemplate.findFirst({
        where: {
          id,
        },
      })

      if (!template || !template.fileKey) {
        throw new ResourceNotFoundException(
          'Template não encontrado ou sem arquivo',
        )
      }

      const fileName = `${template.name.toLowerCase().replace(/\s+/g, '-')}-referencia.docx`

      const downloadUrl = await generateDownloadUrl(template.fileKey, {
        fileName,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

      return reply.status(200).send({ downloadUrl, fileName })
    },
  )
}
