import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { generateUploadUrl } from '@/lib/r2'
import {
  ATTACHMENT_URL_EXPIRES_IN,
  assertUploadAllowed,
  buildAttachmentFileKey,
  MAX_ATTACHMENT_SIZE,
} from '@/services/messaging/attachment-upload'

export const getClientMessageUploadUrl: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/cases/:caseId/messages/upload-url',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Signed URL for message attachment upload (client)',
        operationId: 'getClientMessageUploadUrl',
        security: [{ BearerAuth: [] }],
        params: z.object({ caseId: z.string() }),
        body: z.object({
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1),
          sizeBytes: z.number().min(1).max(MAX_ATTACHMENT_SIZE),
        }),
        response: {
          200: z.object({
            uploadUrl: z.string(),
            fileKey: z.string(),
            expiresIn: z.number(),
          }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { mimeType, sizeBytes } = request.body

      const found = await prisma.case.findFirst({
        where: { id: caseId, clientId: request.user.sub, deletedAt: null },
        select: { id: true },
      })

      if (!found) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      assertUploadAllowed({ mimeType, sizeBytes })

      const fileKey = buildAttachmentFileKey(caseId, mimeType)
      const uploadUrl = await generateUploadUrl(
        fileKey,
        mimeType,
        ATTACHMENT_URL_EXPIRES_IN,
      )

      return reply
        .status(200)
        .send({ uploadUrl, fileKey, expiresIn: ATTACHMENT_URL_EXPIRES_IN })
    },
  )
}
