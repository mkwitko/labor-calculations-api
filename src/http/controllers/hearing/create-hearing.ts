import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { notifyCaseClient } from '@/services/case-events/case-event-service'
import { syncHearingToGoogle } from '@/services/google/google-calendar'
import { getHearingKindLabel } from '@/services/labels/case-labels'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { addBusinessDays } from '@/utils/business-days'
import { formatDateTimePtBr } from '@/utils/format-ptbr'
import { recordActivity } from '@/utils/record-activity'

const hearingKindSchema = z.enum([
  'inicial',
  'conciliacao',
  'instrucao',
  'julgamento',
  'outra',
])

export const createHearing: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases/:caseId/hearings',
    {
      preHandler: [auth],
      schema: {
        tags: ['Hearing'],
        summary: 'Create hearing',
        operationId: 'createHearing',
        params: z.object({ caseId: z.string() }),
        body: z.object({
          scheduledAt: z.string().datetime(),
          kind: hearingKindSchema,
          location: z.string().optional(),
          link: z.string().url().optional(),
          notes: z.string().optional(),
        }),
        response: {
          201: z.object({ id: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { caseId } = request.params
      const { scheduledAt, kind, location, link, notes } = request.body

      await assertCaseWritable(request.tenant, caseId)

      const hearing = await prisma.hearing.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          scheduledAt: new Date(scheduledAt),
          kind,
          location,
          link,
          notes,
        },
        select: { id: true },
      })

      if (kind === 'inicial') {
        const dueAt = addBusinessDays(new Date(scheduledAt), 15)
        await prisma.deadline.create({
          data: {
            caseId,
            organizationId: requireOrganizationId(),
            dueAt,
            kind: 'contestacao',
            autoCalculatedFromHearingId: hearing.id,
          },
        })
      }

      await recordActivity({
        caseId,
        userId,
        kind: 'hearing_created',
        payload: { hearingId: hearing.id, kind, scheduledAt },
      })

      await notifyCaseClient(prisma, {
        caseId,
        type: 'hearing_scheduled',
        title: 'Audiência marcada',
        message: `${getHearingKindLabel(kind)} em ${formatDateTimePtBr(
          new Date(scheduledAt),
        )}.`,
      })

      // Best-effort Google Calendar sync (non-blocking).
      void syncHearingToGoogle(hearing.id)

      return reply.status(201).send({ id: hearing.id })
    },
  )
}
