import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertCaseVisible } from '@/services/tenant/case-access'

export const listDocuments: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/documents',
    {
      preHandler: [auth],
      schema: {
        tags: ['Document'],
        summary: 'List documents for a case',
        operationId: 'listDocuments',
        params: z.object({ caseId: z.string() }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              kind: z.string(),
              fileKey: z.string(),
              fileName: z.string(),
              mimeType: z.string(),
              sizeBytes: z.number(),
              createdAt: z.date(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      await assertCaseVisible(request.tenant, caseId)

      const docs = await prisma.document.findMany({
        where: { caseId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          kind: true,
          fileKey: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      })

      return reply.status(200).send(docs)
    },
  )
}
