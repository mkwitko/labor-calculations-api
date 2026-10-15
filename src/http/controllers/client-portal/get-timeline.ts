import type { TimelineEventType } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'

export const getClientTimeline: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases/:caseId/timeline',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get case timeline for client',
        operationId: 'getClientTimeline',
        security: [{ BearerAuth: [] }],
        params: z.object({
          caseId: z.string().cuid(),
        }),
        querystring: z.object({
          type: z
            .enum([
              'all',
              'processo_iniciado',
              'status_atualizado',
              'audiencia_marcada',
              'documento_enviado',
              'documento_aprovado',
              'documento_rejeitado',
              'proposta_acordo',
              'calculo_atualizado',
              'sentenca_publicada',
              'custom',
            ])
            .optional(),
          limit: z.coerce.number().min(1).max(100).default(50),
          offset: z.coerce.number().min(0).default(0),
        }),
        response: {
          200: z.object({
            events: z.array(
              z.object({
                id: z.string(),
                type: z.string(),
                title: z.string(),
                description: z.string().nullable(),
                date: z.string(),
                responsible: z.string().nullable(),
                nextSteps: z.string().nullable(),
                attachments: z.array(z.string()),
                createdAt: z.string(),
              }),
            ),
            total: z.number(),
            hasMore: z.boolean(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const { type, limit, offset } = request.query
      const clientId = request.user.sub

      // Verify case belongs to client
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

      // Build where clause
      const where: {
        caseId: string
        isVisible: boolean
        type?: TimelineEventType
      } = {
        caseId: caseId,
        isVisible: true,
      }

      if (type && type !== 'all') {
        where.type = type
      }

      // Get total count
      const total = await prisma.timelineEvent.count({ where })

      // Get events
      const events = await prisma.timelineEvent.findMany({
        where,
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          date: true,
          responsible: true,
          nextSteps: true,
          attachments: true,
          createdAt: true,
        },
      })

      const hasMore = offset + limit < total

      return reply.status(200).send({
        events: events.map((event) => ({
          ...event,
          date: event.date.toISOString(),
          createdAt: event.createdAt.toISOString(),
        })),
        total,
        hasMore,
      })
    },
  )
}
