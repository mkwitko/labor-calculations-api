import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { syncDeadlineToGoogle } from '@/services/google/google-calendar'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { caseRelationVisibility } from '@/services/tenant/visibility'
import { recordActivity } from '@/utils/record-activity'
import { removeUndefined } from '@/utils/remove-undefined'

const deadlineKindSchema = z.enum([
  'contestacao',
  'recurso_ordinario',
  'embargos',
  'outros',
])

export const updateDeadline: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/deadlines/:deadlineId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Deadline'],
        summary: 'Update deadline',
        operationId: 'updateDeadline',
        params: z.object({ deadlineId: z.string() }),
        body: z.object({
          dueAt: z.string().datetime().optional(),
          kind: deadlineKindSchema.optional(),
          customLabel: z.string().nullable().optional(),
          doneAt: z.string().datetime().nullable().optional(),
        }),
        response: {
          200: z.object({
            id: z.string(),
            kind: z.string(),
            dueAt: z.date(),
            customLabel: z.string().nullable(),
            doneAt: z.date().nullable(),
            autoCalculatedFromHearingId: z.string().nullable(),
            createdAt: z.date(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { deadlineId } = request.params
      const { dueAt, kind, customLabel, doneAt } = request.body

      const deadline = await prisma.deadline.findFirst({
        where: { id: deadlineId, case: caseRelationVisibility(request.tenant) },
        select: { id: true, caseId: true, doneAt: true },
      })

      if (!deadline) throw new ResourceNotFoundException('Prazo não encontrado')

      await assertCaseWritable(request.tenant, deadline.caseId)

      const parsedDueAt = dueAt === undefined ? undefined : new Date(dueAt)

      let parsedDoneAt: Date | null | undefined

      if (doneAt === undefined) {
        parsedDoneAt = undefined
      } else if (doneAt) {
        parsedDoneAt = new Date(doneAt)
      } else {
        parsedDoneAt = null
      }

      const updated = await prisma.deadline.update({
        where: { id: deadlineId },
        data: removeUndefined({
          dueAt: parsedDueAt,
          kind,
          customLabel,
          doneAt: parsedDoneAt,
        }),
        select: {
          id: true,
          kind: true,
          dueAt: true,
          customLabel: true,
          doneAt: true,
          autoCalculatedFromHearingId: true,
          createdAt: true,
        },
      })

      if (doneAt && !deadline.doneAt) {
        await recordActivity({
          caseId: deadline.caseId,
          userId,
          kind: 'deadline_done',
          payload: { deadlineId },
        })
      }

      // Best-effort: push the change to Google Calendar (upsert by googleEventId).
      void syncDeadlineToGoogle(deadlineId)

      return reply.status(200).send(updated)
    },
  )
}
