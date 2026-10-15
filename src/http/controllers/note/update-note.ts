import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { recordActivity } from '@/utils/record-activity'

export const updateNote: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/cases/:caseId/notes/:noteId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Note'],
        summary: 'Update note',
        operationId: 'updateNote',
        params: z.object({ caseId: z.string(), noteId: z.string() }),
        body: z.object({ body: z.string().min(1) }),
        response: {
          200: z.object({ id: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { caseId, noteId } = request.params
      const { body } = request.body

      await assertCaseWritable(request.tenant, caseId)

      // Só o autor edita ou apaga a própria nota: o papel dá acesso ao caso,
      // não à escrita de outra pessoa.
      const note = await prisma.note.findFirst({
        where: { id: noteId, caseId, userId, deletedAt: null },
        select: { id: true },
      })
      if (!note) throw new ResourceNotFoundException('Nota não encontrada')

      await prisma.note.update({
        where: { id: noteId },
        data: { body },
      })

      await recordActivity({
        caseId,
        userId,
        kind: 'note_updated',
        payload: { noteId },
      })

      return reply.status(200).send({ id: noteId })
    },
  )
}
