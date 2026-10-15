import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { clientAuth } from '@/http/hooks/client-auth'

/**
 * O painel do portal (`GET /client-portal/dashboard`) mostra só o caso mais
 * recente. Cliente com mais de um processo precisa de uma lista para chegar
 * aos outros — é o que esta rota entrega.
 */
export const listClientCases: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: "List the client's cases",
        operationId: 'listClientCases',
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({
            cases: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                phase: z.string(),
                processNumber: z.string().nullable(),
                openedAt: z.string(),
                lawyerName: z.string().nullable(),
                pendingDocuments: z.number(),
                nextHearingAt: z.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const clientId = request.user.sub

      const cases = await prisma.case.findMany({
        where: { clientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          phase: true,
          processNumber: true,
          openedAt: true,
          assignedTo: { select: { name: true } },
        },
      })

      if (cases.length === 0) {
        return reply.status(200).send({ cases: [] })
      }

      const caseIds = cases.map((item) => item.id)

      const pendingByCase = await prisma.documentRequirement.groupBy({
        by: ['caseId'],
        where: { caseId: { in: caseIds }, status: 'pendente' },
        _count: true,
      })

      const pendingMap = new Map(
        pendingByCase.map((row) => [row.caseId, row._count]),
      )

      // Uma consulta só para todos os casos: agrupar por caso e pegar a menor
      // data futura evita N+1 quando o cliente tem vários processos.
      const nextHearings = await prisma.hearing.groupBy({
        by: ['caseId'],
        where: { caseId: { in: caseIds }, scheduledAt: { gte: new Date() } },
        _min: { scheduledAt: true },
      })

      const hearingMap = new Map(
        nextHearings.map((row) => [row.caseId, row._min.scheduledAt]),
      )

      return reply.status(200).send({
        cases: cases.map((item) => ({
          id: item.id,
          title: item.title,
          phase: item.phase,
          processNumber: item.processNumber,
          openedAt: item.openedAt.toISOString(),
          lawyerName: item.assignedTo?.name ?? null,
          pendingDocuments: pendingMap.get(item.id) ?? 0,
          nextHearingAt: hearingMap.get(item.id)?.toISOString() ?? null,
        })),
      })
    },
  )
}
