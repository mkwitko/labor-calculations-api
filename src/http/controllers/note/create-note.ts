import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { recordActivity } from '@/utils/record-activity'

export const createNote: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/notes',
    {
      preHandler: [auth],
      schema: {
        tags: ['Note'],
        summary: 'Create note',
        operationId: 'createNote',
        params: z.object({ caseId: z.string() }),
        body: z.object({ body: z.string().min(1) }),
        response: {
          201: z.object({ id: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { caseId } = request.params
      const { body } = request.body

      await assertCaseWritable(request.tenant, caseId)

      const note = await prisma.note.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          userId,
          body,
        },
        select: { id: true },
      })

      await recordActivity({
        caseId,
        userId,
        kind: 'note_created',
        payload: { noteId: note.id },
      })

      return reply.status(201).send({ id: note.id })
    },
  )
}
