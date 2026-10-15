import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'

export const getClientDocuments: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases/:caseId/documents',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get document requirements for case',
        operationId: 'getClientDocuments',
        security: [{ BearerAuth: [] }],
        params: z.object({
          caseId: z.string().cuid(),
        }),
        response: {
          200: z.object({
            requirements: z.array(
              z.object({
                id: z.string(),
                kind: z.string(),
                customName: z.string().nullable(),
                description: z.string(),
                isMandatory: z.boolean(),
                status: z.enum([
                  'pendente',
                  'enviado',
                  'aprovado',
                  'rejeitado',
                ]),
                rejectionReason: z.string().nullable(),
                dueDate: z.string().nullable(),
                order: z.number(),
                document: z
                  .object({
                    id: z.string(),
                    fileName: z.string(),
                    mimeType: z.string(),
                    sizeBytes: z.number(),
                    createdAt: z.string(),
                  })
                  .nullable(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
            stats: z.object({
              total: z.number(),
              pendente: z.number(),
              enviado: z.number(),
              aprovado: z.number(),
              rejeitado: z.number(),
              completionPercentage: z.number(),
            }),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
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

      // Get document requirements
      const requirements = await prisma.documentRequirement.findMany({
        where: { caseId: caseId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          kind: true,
          customName: true,
          description: true,
          isMandatory: true,
          status: true,
          rejectionReason: true,
          dueDate: true,
          order: true,
          createdAt: true,
          updatedAt: true,
          document: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
          },
        },
      })

      // Calculate stats
      const stats = {
        total: requirements.length,
        pendente: requirements.filter((r) => r.status === 'pendente').length,
        enviado: requirements.filter((r) => r.status === 'enviado').length,
        aprovado: requirements.filter((r) => r.status === 'aprovado').length,
        rejeitado: requirements.filter((r) => r.status === 'rejeitado').length,
        completionPercentage: 0,
      }

      if (stats.total > 0) {
        stats.completionPercentage = Math.round(
          (stats.aprovado / stats.total) * 100,
        )
      }

      return reply.status(200).send({
        requirements: requirements.map((req) => ({
          ...req,
          dueDate: req.dueDate?.toISOString() || null,
          createdAt: req.createdAt.toISOString(),
          updatedAt: req.updatedAt.toISOString(),
          document: req.document
            ? {
                ...req.document,
                createdAt: req.document.createdAt.toISOString(),
              }
            : null,
        })),
        stats,
      })
    },
  )
}
