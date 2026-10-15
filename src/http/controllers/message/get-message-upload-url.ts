import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { generateUploadUrl } from '@/lib/r2'
import {
  ATTACHMENT_URL_EXPIRES_IN,
  assertUploadAllowed,
  buildAttachmentFileKey,
  MAX_ATTACHMENT_SIZE,
} from '@/services/messaging/attachment-upload'
import { assertCaseWritable } from '@/services/tenant/case-access'

export const getMessageUploadUrl: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/messages/upload-url',
    {
      preHandler: [auth],
      schema: {
        tags: ['Message'],
        summary: 'Signed URL for message attachment upload',
        operationId: 'getMessageUploadUrl',
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
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { mimeType, sizeBytes } = request.body

      await assertCaseWritable(request.tenant, caseId)
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
