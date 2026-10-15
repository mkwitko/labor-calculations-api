import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'

export const getClientSettlements: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases/:caseId/settlements',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get settlements for case',
        operationId: 'getClientSettlements',
        security: [{ BearerAuth: [] }],
        params: z.object({
          caseId: z.string().cuid(),
        }),
        response: {
          200: z.object({
            settlements: z.array(
              z.object({
                id: z.string(),
                agreementRate: z.number(),
                agreementValue: z.number(),
                feeType: z.enum(['percentage', 'fixed']),
                feeValue: z.number(),
                feeAmount: z.number(),
                netToClient: z.number(),
                estimatedTime: z.string(),
                status: z.enum(['negotiating', 'accepted', 'rejected']),
                settledAt: z.string().nullable(),
                createdAt: z.string(),
                updatedAt: z.string(),
                calculation: z.object({
                  id: z.string(),
                  totalValue: z.number(),
                  clientName: z.string(),
                }),
              }),
            ),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const clientId = request.user.sub

      const caseExists = await prisma.case.findFirst({
        where: {
          id: caseId,
          clientId: clientId,
          deletedAt: null,
        },
        select: { id: true },
      })

      if (!caseExists) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      const settlements = await prisma.settlement.findMany({
        where: {
          laborCalculation: {
            caseId: caseId,
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          laborCalculation: {
            select: {
              id: true,
              totalValue: true,
              clientName: true,
            },
          },
        },
      })

      return reply.status(200).send({
        settlements: settlements.map((s) => ({
          id: s.id,
          agreementRate: Number(s.agreementRate),
          agreementValue: Number(s.agreementValue),
          feeType: s.feeType,
          feeValue: Number(s.feeValue),
          feeAmount: Number(s.feeAmount),
          netToClient: Number(s.netToClient),
          estimatedTime: s.estimatedTime,
          status: s.status,
          settledAt: s.settledAt?.toISOString() || null,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          calculation: {
            id: s.laborCalculation.id,
            totalValue: Number(s.laborCalculation.totalValue),
            clientName: s.laborCalculation.clientName,
          },
        })),
      })
    },
  )
}
