import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertCaseVisible } from '@/services/tenant/case-access'

export const listNotes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/notes',
    {
      preHandler: [auth],
      schema: {
        tags: ['Note'],
        summary: 'List notes',
        operationId: 'listNotes',
        params: z.object({ caseId: z.string() }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              body: z.string(),
              createdAt: z.date(),
              updatedAt: z.date(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      await assertCaseVisible(request.tenant, caseId)

      const notes = await prisma.note.findMany({
        where: { caseId, deletedAt: null },
        select: { id: true, body: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      })

      return reply.status(200).send(notes)
    },
  )
}
