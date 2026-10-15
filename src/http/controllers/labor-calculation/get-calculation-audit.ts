import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { calculationVisibility } from '@/services/tenant/visibility'

export const getCalculationAudit: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/labor-calculation/:id/audit',
    {
      preHandler: [auth],
      schema: {
        tags: ['LaborCalculation'],
        summary: 'Audit trail of a labor calculation',
        operationId: 'getCalculationAudit',
        params: z.object({ id: z.string() }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              action: z.string(),
              createdAt: z.date(),
              userId: z.string().nullable(),
              userName: z.string().nullable(),
              changes: z.unknown().nullable(),
            }),
          ),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      // Visibilidade primeiro: a trilha conta o histórico do cálculo, então
      // quem não enxerga o cálculo não enxerga a trilha. 404, não 403 — não
      // confirmar a existência de cálculo alheio.
      const calculation = await prisma.laborCalculation.findFirst({
        where: { id, ...calculationVisibility(request.tenant) },
        select: { id: true },
      })

      if (!calculation) {
        return reply.status(404).send({ message: 'Not found' })
      }

      const entries = await prisma.auditLog.findMany({
        where: { entityType: 'LaborCalculation', entityId: id },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      })

      return reply.status(200).send(
        entries.map((e) => ({
          id: e.id,
          action: e.action,
          createdAt: e.createdAt,
          userId: e.userId,
          userName: e.user?.name ?? null,
          changes: e.changes,
        })),
      )
    },
  )
}
