import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  assertUploadAllowed,
  MAX_ATTACHMENT_SIZE,
} from '@/services/messaging/attachment-upload'

export const createClientMessageAttachment: FastifyPluginCallbackZod = (
  app,
) => {
  app.post(
    '/client-portal/cases/:caseId/messages/attachments',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Register uploaded message attachment (client)',
        operationId: 'createClientMessageAttachment',
        security: [{ BearerAuth: [] }],
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
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { fileKey, fileName, mimeType, sizeBytes } = request.body

      const kase = await prisma.case.findFirst({
        where: { id: caseId, clientId: request.user.sub, deletedAt: null },
        select: { assignedToId: true },
      })

      if (!kase) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      assertUploadAllowed({ mimeType, sizeBytes })

      const document = await prisma.document.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          // Mesmo quando quem sobe é o cliente, o documento fica sob o
          // advogado responsável — igual a `confirm-document-upload.ts`.
          userId: kase.assignedToId,
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
