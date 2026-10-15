import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { caseRelationVisibility } from '@/services/tenant/visibility'

// Aggregated "inbox" of pending actions for the lawyer dashboard, in one call.
export const getActionItems: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/dashboard/action-items',
    {
      preHandler: [auth],
      schema: {
        tags: ['Dashboard'],
        summary: 'Pending actions for the dashboard inbox',
        operationId: 'getDashboardActionItems',
        response: {
          200: z.object({
            documentsAwaitingApproval: z.number(),
            settlementsResponded: z.number(),
            openTasks: z.number(),
            overdueDeadlines: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const visibleCase = caseRelationVisibility(request.tenant)
      const now = new Date()

      const [
        documentsAwaitingApproval,
        settlementsResponded,
        openTasks,
        overdueDeadlines,
      ] = await Promise.all([
        prisma.documentRequirement.count({
          where: {
            status: 'enviado',
            case: visibleCase,
          },
        }),
        prisma.settlement.count({
          where: {
            status: { in: ['accepted', 'rejected'] },
            laborCalculation: {
              case: visibleCase,
            },
          },
        }),
        prisma.caseTask.count({
          where: {
            status: { in: ['pendente', 'em_andamento'] },
            case: visibleCase,
          },
        }),
        prisma.deadline.count({
          where: {
            doneAt: null,
            dueAt: { lt: now },
            case: visibleCase,
          },
        }),
      ])

      return reply.status(200).send({
        documentsAwaitingApproval,
        settlementsResponded,
        openTasks,
        overdueDeadlines,
      })
    },
  )
}
