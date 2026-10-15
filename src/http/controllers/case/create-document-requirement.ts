import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { assertCaseWritable } from '@/services/tenant/case-access'

const DocumentKindEnum = z.enum([
  'ctps',
  'holerite',
  'contrato',
  'comprovante',
  'outros',
])

export const createDocumentRequirement: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/document-requirements',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Create document requirement',
        operationId: 'createDocumentRequirement',
        security: [{ BearerAuth: [] }],
        params: z.object({
          caseId: z.string().cuid(),
        }),
        body: z.object({
          kind: DocumentKindEnum,
          customName: z.string().optional(),
          description: z.string().min(1),
          isMandatory: z.boolean().default(true),
          dueDate: z.string().datetime().optional(),
          order: z.number().int().min(0).optional(),
        }),
        response: {
          201: z.object({
            id: z.string(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      await assertCaseWritable(request.tenant, caseId)

      let order = request.body.order
      if (order === undefined) {
        const maxOrder = await prisma.documentRequirement.findFirst({
          where: { caseId: caseId },
          orderBy: { order: 'desc' },
          select: { order: true },
        })
        order = (maxOrder?.order ?? -1) + 1
      }

      const requirement = await prisma.documentRequirement.create({
        data: {
          caseId: caseId,
          organizationId: requireOrganizationId(),
          kind: request.body.kind,
          customName: request.body.customName,
          description: request.body.description,
          isMandatory: request.body.isMandatory,
          dueDate: request.body.dueDate ? new Date(request.body.dueDate) : null,
          order: order,
        },
      })

      return reply.status(201).send({ id: requirement.id })
    },
  )
}
