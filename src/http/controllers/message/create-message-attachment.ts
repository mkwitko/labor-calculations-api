import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  assertUploadAllowed,
  MAX_ATTACHMENT_SIZE,
} from '@/services/messaging/attachment-upload'
import {
  assertCaseWritable,
  findVisibleCase,
} from '@/services/tenant/case-access'

export const createMessageAttachment: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/messages/attachments',
    {
      preHandler: [auth],
      schema: {
        tags: ['Message'],
        summary: 'Register uploaded message attachment',
        operationId: 'createMessageAttachment',
        params: z.object({ caseId: z.string() }),
        body: z.object({
          fileKey: z.string().min(1),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1),
          sizeBytes: z.number().min(1).max(MAX_ATTACHMENT_SIZE),
        }),
        response: {
          201: z.object({ documentId: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { fileKey, fileName, mimeType, sizeBytes } = request.body

      await assertCaseWritable(request.tenant, caseId)
      assertUploadAllowed({ mimeType, sizeBytes })

      const kase = await findVisibleCase(request.tenant, caseId, {
        assignedToId: true,
      })

      const document = await prisma.document.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          // `Document.userId` aponta para o advogado responsável, como em
          // `client-portal/confirm-document-upload.ts`. Quem de fato enviou
          // fica registrado na mensagem.
          userId: kase?.assignedToId ?? request.user.sub,
          kind: 'outros',
          fileKey,
          fileName,
          mimeType,
          sizeBytes,
        },
        select: { id: true },
      })

      return reply.status(201).send({ documentId: document.id })
    },
  )
}
