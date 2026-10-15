import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import {
  recordTimelineEvent,
  sendEmailSafe,
} from '@/services/case-events/case-event-service'
import { emailTemplates } from '@/services/email/templates'

export const rejectSettlement: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/settlements/:settlementId/reject',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Reject settlement proposal',
        operationId: 'rejectSettlement',
        security: [{ BearerAuth: [] }],
        params: z.object({
          settlementId: z.string().cuid(),
        }),
        body: z.object({
          reason: z.string().optional(),
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
      const { settlementId } = request.params
      const { reason } = request.body
      const clientId = request.user.sub

      const settlement = await prisma.settlement.findFirst({
        where: {
          id: settlementId,
          laborCalculation: {
            case: {
              clientId: clientId,
              deletedAt: null,
            },
          },
        },
        select: {
          id: true,
          status: true,
          laborCalculation: {
            select: {
              id: true,
              caseId: true,
              case: {
                select: {
                  id: true,
                  title: true,
                  assignedToId: true,
                  assignedTo: {
                    select: { mail: true, name: true },
                  },
                },
              },
            },
          },
        },
      })

      if (!settlement) {
        throw new ResourceNotFoundException('Proposta de acordo não encontrada')
      }

      if (settlement.status !== 'negotiating') {
        throw new BadRequestException('Esta proposta já foi respondida')
      }

      const description = reason
        ? `Cliente rejeitou a proposta de acordo. Motivo: ${reason}`
        : 'Cliente rejeitou a proposta de acordo'

      await prisma.$transaction(async (tx) => {
        await tx.settlement.update({
          where: { id: settlementId },
          data: {
            status: 'rejected',
          },
        })

        if (settlement.laborCalculation.caseId) {
          await recordTimelineEvent(tx, {
            caseId: settlement.laborCalculation.caseId,
            type: 'proposta_acordo',
            title: 'Acordo Rejeitado',
            description,
            responsible: 'Cliente',
          })
        }
      })

      const lawyer = settlement.laborCalculation.case?.assignedTo
      if (lawyer?.mail) {
        await sendEmailSafe(
          {
            to: lawyer.mail,
            ...emailTemplates.settlementRejected({
              lawyerName: lawyer.name,
              caseTitle: settlement.laborCalculation.case?.title ?? '',
              reason,
            }),
          },
          'settlement rejected',
        )
      }

      return reply.status(200).send({
        message: 'Proposta de acordo rejeitada',
      })
    },
  )
}
