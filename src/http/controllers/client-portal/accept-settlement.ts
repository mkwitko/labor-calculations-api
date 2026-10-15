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

export const acceptSettlement: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/settlements/:settlementId/accept',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Accept settlement proposal',
        operationId: 'acceptSettlement',
        security: [{ BearerAuth: [] }],
        params: z.object({
          settlementId: z.string().cuid(),
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

      await prisma.$transaction(async (tx) => {
        await tx.settlement.update({
          where: { id: settlementId },
          data: {
            status: 'accepted',
            settledAt: new Date(),
          },
        })

        await tx.laborCalculation.update({
          where: { id: settlement.laborCalculation.id },
          data: {
            status: 'acordo_fechado',
          },
        })

        if (settlement.laborCalculation.caseId) {
          await recordTimelineEvent(tx, {
            caseId: settlement.laborCalculation.caseId,
            type: 'proposta_acordo',
            title: 'Acordo Aceito',
            description: 'Cliente aceitou a proposta de acordo',
            responsible: 'Cliente',
          })
        }
      })

      const lawyer = settlement.laborCalculation.case?.assignedTo
      if (lawyer?.mail) {
        await sendEmailSafe(
          {
            to: lawyer.mail,
            ...emailTemplates.settlementAccepted({
              lawyerName: lawyer.name,
              caseTitle: settlement.laborCalculation.case?.title ?? '',
            }),
          },
          'settlement accepted',
        )
      }

      return reply.status(200).send({
        message: 'Proposta de acordo aceita com sucesso',
      })
    },
  )
}
