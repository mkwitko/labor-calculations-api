import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { recordTimelineEvent } from '@/services/case-events/case-event-service'

export const confirmDocumentUpload: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/documents',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Confirm document upload',
        operationId: 'clientConfirmDocumentUpload',
        security: [{ BearerAuth: [] }],
        body: z.object({
          requirementId: z.string().cuid(),
          fileKey: z.string().min(1),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1),
          sizeBytes: z.number().min(1),
        }),
        response: {
          201: z.object({
            id: z.string(),
            message: z.string(),
          }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { requirementId, fileKey, fileName, mimeType, sizeBytes } =
        request.body
      const clientId = request.user.sub

      const requirement = await prisma.documentRequirement.findFirst({
        where: {
          id: requirementId,
          case: {
            clientId: clientId,
            deletedAt: null,
          },
        },
        select: {
          id: true,
          caseId: true,
          kind: true,
          customName: true,
          case: {
            select: {
              assignedToId: true,
              title: true,
            },
          },
        },
      })

      if (!requirement) {
        throw new ResourceNotFoundException(
          'Requisito de documento não encontrado',
        )
      }

      const result = await prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            caseId: requirement.caseId,
            organizationId: requireOrganizationId(),
            userId: requirement.case.assignedToId,
            kind: requirement.kind,
            fileKey,
            fileName,
            mimeType,
            sizeBytes,
          },
        })

        await tx.documentRequirement.update({
          where: { id: requirementId },
          data: {
            status: 'enviado',
            documentId: document.id,
          },
        })

        await recordTimelineEvent(tx, {
          caseId: requirement.caseId,
          type: 'documento_enviado',
          title: 'Documento Enviado',
          description: `${requirement.customName || requirement.kind} foi enviado pelo cliente`,
          responsible: 'Cliente',
        })

        return document
      })

      return reply.status(201).send({
        id: result.id,
        message:
          'Documento enviado com sucesso. Aguardando aprovação do advogado.',
      })
    },
  )
}
