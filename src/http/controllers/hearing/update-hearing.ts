import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { syncHearingToGoogle } from '@/services/google/google-calendar'
import { caseRelationVisibility } from '@/services/tenant/visibility'
import { removeUndefined } from '@/utils/remove-undefined'

const hearingKindSchema = z.enum([
  'inicial',
  'conciliacao',
  'instrucao',
  'julgamento',
  'outra',
])

export const updateHearing: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/hearings/:hearingId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Hearing'],
        summary: 'Update hearing',
        operationId: 'updateHearing',
        params: z.object({ hearingId: z.string() }),
        body: z.object({
          scheduledAt: z.string().datetime().optional(),
          kind: hearingKindSchema.optional(),
          location: z.string().nullable().optional(),
          link: z.string().url().nullable().optional(),
          notes: z.string().nullable().optional(),
        }),
        response: {
          200: z.object({
            id: z.string(),
            kind: z.string(),
            scheduledAt: z.date(),
            location: z.string().nullable(),
            link: z.string().nullable(),
            notes: z.string().nullable(),
            createdAt: z.date(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { hearingId } = request.params
      const { scheduledAt, kind, location, link, notes } = request.body

      const hearing = await prisma.hearing.findFirst({
        where: { id: hearingId, case: caseRelationVisibility(request.tenant) },
        select: { id: true, caseId: true },
      })
      if (!hearing)
        throw new ResourceNotFoundException('Audiência não encontrada')

      const updated = await prisma.hearing.update({
        where: { id: hearingId },
        data: removeUndefined({
          scheduledAt:
            scheduledAt === undefined ? undefined : new Date(scheduledAt),
          kind,
          location,
          link,
          notes,
        }),
        select: {
          id: true,
          kind: true,
          scheduledAt: true,
          location: true,
          link: true,
          notes: true,
          createdAt: true,
        },
      })

      // Best-effort: push the change to Google Calendar (upsert by googleEventId).
      void syncHearingToGoogle(hearingId)

      return reply.status(200).send(updated)
    },
  )
}
