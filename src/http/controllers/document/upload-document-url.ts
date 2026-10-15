import { randomUUID } from 'node:crypto'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { generateUploadUrl } from '@/lib/r2'
import { assertCaseWritable } from '@/services/tenant/case-access'

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

const documentKindSchema = z.enum([
  'ctps',
  'holerite',
  'contrato',
  'comprovante',
  'outros',
])

export const uploadDocumentUrl: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/documents/upload-url',
    {
      preHandler: [auth],
      schema: {
        tags: ['Document'],
        summary: 'Get presigned upload URL for case document',
        operationId: 'uploadDocumentUrl',
        params: z.object({ caseId: z.string() }),
        body: z.object({
          fileName: z.string(),
          mimeType: z.string(),
          kind: documentKindSchema,
          sizeBytes: z.number().int().max(26_214_400),
        }),
        response: {
          200: z.object({ uploadUrl: z.string(), fileKey: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { mimeType, sizeBytes } = request.body

      await assertCaseWritable(request.tenant, caseId)

      if (!ALLOWED_TYPES.has(mimeType)) {
        return reply
          .status(400)
          .send({ message: 'Tipo de arquivo não suportado' })
      }

      if (sizeBytes > 26_214_400) {
        return reply.status(400).send({ message: 'Arquivo excede 25MB' })
      }

      const ext = EXTENSIONS[mimeType] ?? 'bin'
      const fileKey = `documents/${caseId}/${randomUUID()}.${ext}`
      const uploadUrl = await generateUploadUrl(fileKey, mimeType)

      return reply.status(200).send({ uploadUrl, fileKey })
    },
  )
}
