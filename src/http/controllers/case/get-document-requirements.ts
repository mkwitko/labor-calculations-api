import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { caseVisibility } from '@/services/tenant/visibility'

const DocumentKindEnum = z.enum([
  'ctps',
  'holerite',
  'contrato',
  'comprovante',
  'outros',
])
const DocumentStatusEnum = z.enum([
  'pendente',
  'enviado',
  'aprovado',
  'rejeitado',
])

export const getDocumentRequirements: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/document-requirements',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Get document requirements for case',
        operationId: 'getDocumentRequirements',
        security: [{ BearerAuth: [] }],
        params: z.object({
          caseId: z.string().cuid(),
        }),
        response: {
          200: z.object({
            requirements: z.array(
              z.object({
                id: z.string(),
                kind: DocumentKindEnum,
                customName: z.string().nullable(),
                description: z.string(),
                isMandatory: z.boolean(),
                status: DocumentStatusEnum,
                rejectionReason: z.string().nullable(),
                dueDate: z.string().nullable(),
                order: z.number(),
                document: z
                  .object({
                    id: z.string(),
                    fileName: z.string(),
                    fileKey: z.string(),
                    mimeType: z.string(),
                    sizeBytes: z.number(),
                    createdAt: z.string(),
                  })
                  .nullable(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      const caseExists = await prisma.case.findFirst({
        where: {
          id: caseId,
          ...caseVisibility(request.tenant),
          deletedAt: null,
        },
        select: { id: true },
      })

      if (!caseExists) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      const requirements = await prisma.documentRequirement.findMany({
        where: { caseId: caseId },
        orderBy: { order: 'asc' },
        include: {
          document: {
            select: {
              id: true,
              fileName: true,
              fileKey: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
          },
        },
      })

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
      })
    },
  )
}
