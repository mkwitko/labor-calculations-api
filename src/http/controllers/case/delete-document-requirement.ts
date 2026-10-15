import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { caseRelationVisibility } from '@/services/tenant/visibility'

export const deleteDocumentRequirement: FastifyPluginCallbackZod = (app) => {
  app.delete(
    '/document-requirements/:requirementId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Delete document requirement',
        operationId: 'deleteDocumentRequirement',
        security: [{ BearerAuth: [] }],
        params: z.object({
          requirementId: z.string().cuid(),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
          400: z.object({ message: z.string() }),
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
        select: { id: true, status: true },
      })

      if (!requirement) {
        throw new ResourceNotFoundException('Requisito não encontrado')
      }

      if (requirement.status !== 'pendente') {
        throw new BadRequestException(
          'Não é possível excluir requisito com documento já enviado',
        )
      }

      await prisma.documentRequirement.delete({
        where: { id: requirementId },
      })

      return reply
        .status(200)
        .send({ message: 'Requisito excluído com sucesso' })
    },
  )
}
