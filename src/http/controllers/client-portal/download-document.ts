import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { generateDownloadUrl } from '@/lib/r2'

const DOWNLOAD_URL_EXPIRES_IN = 3600

export const getDocumentDownloadUrl: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/documents/:documentId/download-url',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Generate signed URL for document download',
        operationId: 'getDocumentDownloadUrl',
        security: [{ BearerAuth: [] }],
        params: z.object({
          documentId: z.string().cuid(),
        }),
        response: {
          200: z.object({
            downloadUrl: z.string(),
            fileName: z.string(),
            expiresIn: z.number(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { documentId } = request.params
      const clientId = request.user.sub

      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          case: {
            clientId: clientId,
            deletedAt: null,
          },
          deletedAt: null,
        },
        select: {
          id: true,
          fileKey: true,
          fileName: true,
          mimeType: true,
        },
      })

      if (!document) {
        throw new ResourceNotFoundException('Documento não encontrado')
      }

      const downloadUrl = await generateDownloadUrl(document.fileKey, {
        fileName: document.fileName,
        mimeType: document.mimeType,
        expiresIn: DOWNLOAD_URL_EXPIRES_IN,
      })

      return reply.status(200).send({
        downloadUrl,
        fileName: document.fileName,
        expiresIn: DOWNLOAD_URL_EXPIRES_IN,
      })
    },
  )
}
