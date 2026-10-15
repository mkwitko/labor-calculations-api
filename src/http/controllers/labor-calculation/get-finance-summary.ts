import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertFinanceAccess } from '@/services/tenant/case-access'
import { caseRelationVisibility } from '@/services/tenant/visibility'

// Office-wide financial summary: agreed settlement value, received (paid
// installments), receivable (unpaid), and overdue receivable.
export const getFinanceSummary: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/dashboard/finance',
    {
      preHandler: [auth],
      schema: {
        tags: ['Dashboard'],
        summary: 'Office financial summary',
        operationId: 'getFinanceSummary',
        response: {
          200: z.object({
            agreedTotal: z.number(),
            received: z.number(),
            receivable: z.number(),
            overdue: z.number(),
            acceptedSettlements: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      assertFinanceAccess(request.tenant)

      const now = new Date()
      const visibleCase = caseRelationVisibility(request.tenant)
      const ownedBy = {
        settlement: {
          laborCalculation: { case: visibleCase },
        },
      }

      const [agreed, paidAgg, unpaidAgg, overdueAgg] = await Promise.all([
        prisma.settlement.aggregate({
          _sum: { agreementValue: true },
          where: {
            status: 'accepted',
            laborCalculation: {
              case: visibleCase,
            },
          },
        }),
        prisma.settlementInstallment.aggregate({
          _sum: { amount: true },
          where: { paidAt: { not: null }, ...ownedBy },
        }),
        prisma.settlementInstallment.aggregate({
          _sum: { amount: true },
          where: { paidAt: null, ...ownedBy },
        }),
        prisma.settlementInstallment.aggregate({
          _sum: { amount: true },
          where: { paidAt: null, dueDate: { lt: now }, ...ownedBy },
        }),
      ])

      const acceptedSettlements = await prisma.settlement.count({
        where: {
          status: 'accepted',
          laborCalculation: { case: visibleCase },
        },
      })

      const num = (v: unknown) => (v ? Number(v) : 0)

      return reply.status(200).send({
        agreedTotal: num(agreed._sum.agreementValue),
        received: num(paidAgg._sum.amount),
        receivable: num(unpaidAgg._sum.amount),
        overdue: num(overdueAgg._sum.amount),
        acceptedSettlements,
      })
    },
  )
}
