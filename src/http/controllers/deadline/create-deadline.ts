import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { syncDeadlineToGoogle } from '@/services/google/google-calendar'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { recordActivity } from '@/utils/record-activity'

const deadlineKindSchema = z.enum([
  'contestacao',
  'recurso_ordinario',
  'embargos',
  'outros',
])

export const createDeadline: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/deadlines',
    {
      preHandler: [auth],
      schema: {
        tags: ['Deadline'],
        summary: 'Create deadline',
        operationId: 'createDeadline',
        params: z.object({ caseId: z.string() }),
        body: z.object({
          dueAt: z.string().datetime(),
          kind: deadlineKindSchema,
          customLabel: z.string().optional(),
        }),
        response: {
          201: z.object({ id: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { caseId } = request.params
      const { dueAt, kind, customLabel } = request.body

      await assertCaseWritable(request.tenant, caseId)

      const deadline = await prisma.deadline.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          dueAt: new Date(dueAt),
          kind,
          customLabel,
        },
        select: { id: true },
      })

      await recordActivity({
        caseId,
        userId,
        kind: 'deadline_created',
        payload: { deadlineId: deadline.id, kind, dueAt },
      })

      void syncDeadlineToGoogle(deadline.id)

      return reply.status(201).send({ id: deadline.id })
    },
  )
}
