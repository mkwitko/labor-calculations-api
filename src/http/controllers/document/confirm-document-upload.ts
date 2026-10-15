import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { recordActivity } from '@/utils/record-activity'

const documentKindSchema = z.enum([
  'ctps',
  'holerite',
  'contrato',
  'comprovante',
  'outros',
])

export const confirmDocumentUpload: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/documents',
    {
      preHandler: [auth],
      schema: {
        tags: ['Document'],
        summary: 'Confirm document upload and save metadata',
        operationId: 'confirmDocumentUpload',
        params: z.object({ caseId: z.string() }),
        body: z.object({
          fileKey: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
          sizeBytes: z.number().int(),
          kind: documentKindSchema,
        }),
        response: {
          201: z.object({ id: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { caseId } = request.params
      const { fileKey, fileName, mimeType, sizeBytes, kind } = request.body

      await assertCaseWritable(request.tenant, caseId)

      const doc = await prisma.document.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          userId,
          kind,
          fileKey,
          fileName,
          mimeType,
          sizeBytes,
        },
        select: { id: true },
      })

      await recordActivity({
        caseId,
        userId,
        kind: 'doc_uploaded',
        payload: { documentId: doc.id, fileName, kind },
      })

      return reply.status(201).send({ id: doc.id })
    },
  )
}
