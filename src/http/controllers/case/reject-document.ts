import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import {
  createClientNotification,
  recordTimelineEvent,
  sendEmailSafe,
} from '@/services/case-events/case-event-service'
import { emailTemplates } from '@/services/email/templates'
import { caseRelationVisibility } from '@/services/tenant/visibility'

export const rejectDocument: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/document-requirements/:requirementId/reject',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Reject document',
        operationId: 'rejectDocument',
        security: [{ BearerAuth: [] }],
        params: z.object({
          requirementId: z.string().cuid(),
        }),
        body: z.object({
          reason: z.string().min(1, 'Motivo da rejeição é obrigatório'),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { requirementId } = request.params
      const { reason } = request.body

      const requirement = await prisma.documentRequirement.findFirst({
        where: {
          id: requirementId,
          case: caseRelationVisibility(request.tenant),
        },
        select: {
          id: true,
          status: true,
          caseId: true,
          kind: true,
          customName: true,
          documentId: true,
          case: {
            select: {
              clientId: true,
              title: true,
            },
          },
        },
      })

      if (!requirement) {
        throw new ResourceNotFoundException('Requisito não encontrado')
      }

      if (requirement.status !== 'enviado') {
        throw new BadRequestException('Documento não está aguardando aprovação')
      }

      const docName = requirement.customName || requirement.kind

      const clientEmail = await prisma.$transaction(async (tx) => {
        await tx.documentRequirement.update({
          where: { id: requirementId },
          data: {
            status: 'rejeitado',
            rejectionReason: reason,
            documentId: null,
          },
        })

        if (requirement.documentId) {
          await tx.document.update({
            where: { id: requirement.documentId },
            data: { deletedAt: new Date() },
          })
        }

        await recordTimelineEvent(tx, {
          caseId: requirement.caseId,
          type: 'documento_rejeitado',
          title: 'Documento Rejeitado',
          description: `${docName} foi rejeitado. Motivo: ${reason}`,
          responsible: 'Advogado',
        })

        if (!requirement.case.clientId) return null

        const client = await tx.client.findFirst({
          where: { id: requirement.case.clientId, deletedAt: null },
          select: { mail: true, name: true },
        })

        await createClientNotification(tx, {
          clientId: requirement.case.clientId,
          type: 'document_rejected',
          title: 'Documento Rejeitado',
          message: `Seu documento ${docName} foi rejeitado. Motivo: ${reason}`,
          link: `/cases/${requirement.caseId}/documents`,
        })

        return client?.mail ? { mail: client.mail, name: client.name } : null
      })

      if (clientEmail) {
        await sendEmailSafe(
          {
            to: clientEmail.mail,
            ...emailTemplates.documentRejected({
              clientName: clientEmail.name,
              docName,
              caseTitle: requirement.case.title,
              reason,
            }),
          },
          'document rejected',
        )
      }

      return reply.status(200).send({ message: 'Documento rejeitado' })
    },
  )
}
