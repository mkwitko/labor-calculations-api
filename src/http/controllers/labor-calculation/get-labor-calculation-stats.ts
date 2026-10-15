import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { calculationVisibility } from '@/services/tenant/visibility'

const ACTIVE_STATUSES = [
  'em_andamento',
  'proposta_enviada',
  'ajuizado',
] as const
const PRESCRIPTION_RISK_DAYS = 60

export const getLaborCalculationStats: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/labor-calculation/stats',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Get labor calculation stats for dashboard',
        operationId: 'getLaborCalculationStats',
        response: {
          200: z.object({
            activeCount: z.number(),
            activeValue: z.number(),
            prescriptionRisk: z.number(),
            acordosFechados: z.number(),
            statusDistribution: z.array(
              z.object({ status: z.string(), count: z.number() }),
            ),
            termDistribution: z.array(
              z.object({ terminationType: z.string(), count: z.number() }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const visible = calculationVisibility(request.tenant)

      const now = new Date()
      const prescriptionStart = new Date(now)
      prescriptionStart.setFullYear(prescriptionStart.getFullYear() - 2)
      const prescriptionEnd = new Date(prescriptionStart)
      prescriptionEnd.setDate(
        prescriptionEnd.getDate() + PRESCRIPTION_RISK_DAYS,
      )

      const [
        activeCount,
        activeValueResult,
        prescriptionRisk,
        acordosFechados,
        statusGroups,
        termGroups,
      ] = await Promise.all([
        prisma.laborCalculation.count({
          where: {
            ...visible,
            status: { in: [...ACTIVE_STATUSES] },
            deletedAt: null,
          },
        }),
        prisma.laborCalculation.aggregate({
          where: {
            ...visible,
            status: { in: [...ACTIVE_STATUSES] },
            deletedAt: null,
          },
          _sum: { totalValue: true },
        }),
        prisma.laborCalculation.count({
          where: {
            ...visible,
            status: { in: [...ACTIVE_STATUSES] },
            deletedAt: null,
            endDate: { gte: prescriptionStart, lte: prescriptionEnd },
          },
        }),
        prisma.laborCalculation.count({
          where: { ...visible, status: 'acordo_fechado', deletedAt: null },
        }),
        prisma.laborCalculation.groupBy({
          by: ['status'],
          where: { ...visible, deletedAt: null },
          _count: { _all: true },
        }),
        prisma.laborCalculation.groupBy({
          by: ['terminationType'],
          where: { ...visible, deletedAt: null },
          _count: { _all: true },
        }),
      ])

      return {
        activeCount,
        activeValue: activeValueResult._sum.totalValue?.toNumber() ?? 0,
        prescriptionRisk,
        acordosFechados,
        statusDistribution: statusGroups.map((g) => ({
          status: g.status,
          count: g._count._all,
        })),
        termDistribution: termGroups.map((g) => ({
          terminationType: g.terminationType,
          count: g._count._all,
        })),
      }
    },
  )
}
