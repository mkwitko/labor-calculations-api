import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { caseRelationVisibility } from '@/services/tenant/visibility'
import { removeUndefined } from '@/utils/remove-undefined'

export const updateDocumentRequirement: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/document-requirements/:requirementId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Update document requirement',
        operationId: 'updateDocumentRequirement',
        security: [{ BearerAuth: [] }],
        params: z.object({
          requirementId: z.string().cuid(),
        }),
        body: z.object({
          customName: z.string().optional(),
          description: z.string().min(1).optional(),
          isMandatory: z.boolean().optional(),
          dueDate: z.string().datetime().nullable().optional(),
          order: z.number().int().min(0).optional(),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { requirementId } = request.params

      const requirement = await prisma.documentRequirement.findFirst({
        where: {
          id: requirementId,
          case: caseRelationVisibility(request.tenant),
        },
        select: { id: true },
      })

      if (!requirement) {
        throw new ResourceNotFoundException('Requisito não encontrado')
      }

      const { dueDate, ...rest } = request.body

      function parseDueDate(dueDate?: string | null) {
        if (dueDate === undefined) {
          return undefined
        }

        return dueDate ? new Date(dueDate) : null
      }

      await prisma.documentRequirement.update({
        where: { id: requirementId },
        data: removeUndefined({
          ...rest,
          dueDate: parseDueDate(dueDate),
        }),
      })

      return reply
        .status(200)
        .send({ message: 'Requisito atualizado com sucesso' })
    },
  )
}
