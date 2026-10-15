import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { env } from '@/env'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { listGoogleEvents } from '@/services/google/google-calendar'
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  isGoogleConfigured,
  verifyOAuthState,
} from '@/services/google/google-oauth'
import { findVisibleCase } from '@/services/tenant/case-access'
import {
  canWriteCases,
  caseRelationVisibility,
} from '@/services/tenant/visibility'

export const googleCalendarRoutes: FastifyPluginCallbackZod = (app) => {
  // Status of the integration for the current user.
  app.get(
    '/integrations/google/status',
    {
      preHandler: [auth],
      schema: {
        tags: ['Integration'],
        summary: 'Google Calendar integration status',
        operationId: 'getGoogleCalendarStatus',
        response: {
          200: z.object({
            configured: z.boolean(),
            connected: z.boolean(),
            email: z.string().nullable(),
            syncHearings: z.boolean(),
            syncDeadlines: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const integration = await prisma.googleIntegration.findUnique({
        where: { userId },
      })
      return reply.status(200).send({
        configured: isGoogleConfigured(),
        connected: Boolean(integration),
        email: integration?.email ?? null,
        syncHearings: integration?.syncHearings ?? true,
        syncDeadlines: integration?.syncDeadlines ?? true,
      })
    },
  )

  // Returns the Google consent URL to start the OAuth flow.
  app.get(
    '/integrations/google/auth-url',
    {
      preHandler: [auth],
      schema: {
        tags: ['Integration'],
        summary: 'Get Google OAuth consent URL',
        operationId: 'getGoogleAuthUrl',
        response: {
          200: z.object({ url: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      if (!isGoogleConfigured()) {
        throw new BadRequestException(
          'Integração com Google não configurada no servidor.',
        )
      }
      const userId = request.user.sub
      return reply.status(200).send({ url: buildGoogleAuthUrl(userId) })
    },
  )

  // OAuth callback (Google redirects here). Public route: identifies the user
  // via `state`. Redirects back to the app afterwards.
  app.get(
    '/integrations/google/callback',
    {
      schema: {
        tags: ['Integration'],
        summary: 'Google OAuth callback',
        operationId: 'googleOAuthCallback',
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { code, state, error } = request.query
      const redirectBase = `${env.CLIENT_URL}/settings?google=`
      if (error || !code || !state) {
        return reply.redirect(`${redirectBase}error`)
      }
      // Verify the signed state and trust ONLY the userId it encodes — never
      // the raw query value (which would be attacker-forgeable).
      const userId = verifyOAuthState(state)
      if (!userId) {
        return reply.redirect(`${redirectBase}error`)
      }
      try {
        const tokens = await exchangeGoogleCode(code)
        await prisma.googleIntegration.upsert({
          where: { userId },
          create: {
            userId,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            email: tokens.email,
          },
          update: {
            accessToken: tokens.accessToken,
            ...(tokens.refreshToken
              ? { refreshToken: tokens.refreshToken }
              : {}),
            expiresAt: tokens.expiresAt,
            email: tokens.email,
          },
        })
        return reply.redirect(`${redirectBase}connected`)
      } catch {
        return reply.redirect(`${redirectBase}error`)
      }
    },
  )

  // Update sync preferences.
  app.patch(
    '/integrations/google/prefs',
    {
      preHandler: [auth],
      schema: {
        tags: ['Integration'],
        summary: 'Update Google Calendar sync preferences',
        operationId: 'updateGoogleCalendarPrefs',
        body: z.object({
          syncHearings: z.boolean().optional(),
          syncDeadlines: z.boolean().optional(),
        }),
        response: {
          200: z.object({ ok: z.boolean() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const existing = await prisma.googleIntegration.findUnique({
        where: { userId },
      })
      if (!existing) {
        return reply.status(404).send({ message: 'Integração não conectada' })
      }
      await prisma.googleIntegration.update({
        where: { userId },
        data: request.body,
      })
      return reply.status(200).send({ ok: true })
    },
  )

  // Disconnect the integration.
  app.delete(
    '/integrations/google',
    {
      preHandler: [auth],
      schema: {
        tags: ['Integration'],
        summary: 'Disconnect Google Calendar',
        operationId: 'disconnectGoogleCalendar',
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      await prisma.googleIntegration.deleteMany({ where: { userId } })
      return reply.status(204).send(null)
    },
  )

  // Lists upcoming Google Calendar events for the user to pick from, flagging
  // the ones already imported into the platform.
  app.get(
    '/integrations/google/events',
    {
      preHandler: [auth],
      schema: {
        tags: ['Integration'],
        summary: 'List importable Google Calendar events',
        operationId: 'listGoogleCalendarEvents',
        querystring: z.object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
        response: {
          200: z.object({
            data: z.array(
              z.object({
                googleEventId: z.string(),
                title: z.string(),
                description: z.string().nullable(),
                location: z.string().nullable(),
                startsAt: z.string(),
                endsAt: z.string().nullable(),
                allDay: z.boolean(),
                alreadyImported: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const userId = request.user.sub
      const now = new Date()
      const from = request.query.from ? new Date(request.query.from) : now
      const to = request.query.to
        ? new Date(request.query.to)
        : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

      const events = await listGoogleEvents(userId, from, to)
      const ids = events.map((e) => e.googleEventId)

      // An event counts as imported if it exists as a personal agenda event or
      // as a hearing/deadline carrying that googleEventId.
      const [agenda, hearings, deadlines] = await Promise.all([
        prisma.agendaEvent.findMany({
          where: { userId, googleEventId: { in: ids } },
          select: { googleEventId: true },
        }),
        prisma.hearing.findMany({
          where: {
            googleEventId: { in: ids },
            case: caseRelationVisibility(request.tenant),
          },
          select: { googleEventId: true },
        }),
        prisma.deadline.findMany({
          where: {
            googleEventId: { in: ids },
            case: caseRelationVisibility(request.tenant),
          },
          select: { googleEventId: true },
        }),
      ])
      const imported = new Set<string>(
        [...agenda, ...hearings, ...deadlines]
          .map((r) => r.googleEventId)
          .filter((v): v is string => !!v),
      )

      return {
        data: events.map((e) => ({
          ...e,
          alreadyImported: imported.has(e.googleEventId),
        })),
      }
    },
  )

  // Imports selected Google events. Each item is brought in either as a
  // personal agenda event or attached to a case as a hearing/deadline.
  app.post(
    '/integrations/google/import',
    {
      preHandler: [auth],
      schema: {
        tags: ['Integration'],
        summary: 'Import selected Google Calendar events',
        operationId: 'importGoogleCalendarEvents',
        body: z.object({
          events: z
            .array(
              z.object({
                googleEventId: z.string(),
                title: z.string(),
                description: z.string().nullable().optional(),
                location: z.string().nullable().optional(),
                startsAt: z.string().datetime(),
                endsAt: z.string().datetime().nullable().optional(),
                allDay: z.boolean().optional(),
                target: z.enum(['personal', 'hearing', 'deadline']),
                caseId: z.string().optional(),
                hearingKind: z
                  .enum([
                    'inicial',
                    'conciliacao',
                    'instrucao',
                    'julgamento',
                    'outra',
                  ])
                  .optional(),
                deadlineKind: z
                  .enum([
                    'contestacao',
                    'recurso_ordinario',
                    'embargos',
                    'outros',
                  ])
                  .optional(),
              }),
            )
            .min(1),
        }),
        response: {
          200: z.object({ imported: z.number(), skipped: z.number() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const organizationId = requireOrganizationId()
      let imported = 0
      let skipped = 0

      for (const item of request.body.events) {
        try {
          if (item.target === 'personal') {
            await prisma.agendaEvent.upsert({
              where: {
                userId_googleEventId: {
                  userId,
                  googleEventId: item.googleEventId,
                },
              },
              create: {
                userId,
                organizationId,
                title: item.title,
                description: item.description ?? null,
                location: item.location ?? null,
                startsAt: new Date(item.startsAt),
                endsAt: item.endsAt ? new Date(item.endsAt) : null,
                allDay: item.allDay ?? false,
                source: 'google',
                googleEventId: item.googleEventId,
              },
              update: {
                title: item.title,
                startsAt: new Date(item.startsAt),
                endsAt: item.endsAt ? new Date(item.endsAt) : null,
              },
            })
            imported++
            continue
          }

          // hearing / deadline require an owned case
          if (!item.caseId) {
            skipped++
            continue
          }
          // Importar para dentro de um caso é escrita de caso: o papel tem de
          // poder alterá-lo, e o caso tem de ser visível para ele.
          const writableCase = await findVisibleCase(
            request.tenant,
            item.caseId,
            { id: true },
          )
          if (!writableCase || !canWriteCases(request.tenant.role)) {
            skipped++
            continue
          }

          if (item.target === 'hearing') {
            const exists = await prisma.hearing.findFirst({
              where: { googleEventId: item.googleEventId, caseId: item.caseId },
              select: { id: true },
            })
            if (exists) {
              skipped++
              continue
            }
            await prisma.hearing.create({
              data: {
                caseId: item.caseId,
                organizationId,
                scheduledAt: new Date(item.startsAt),
                kind: item.hearingKind ?? 'outra',
                location: item.location ?? undefined,
                notes: item.description ?? undefined,
                googleEventId: item.googleEventId,
              },
            })
          } else {
            const exists = await prisma.deadline.findFirst({
              where: { googleEventId: item.googleEventId, caseId: item.caseId },
              select: { id: true },
            })
            if (exists) {
              skipped++
              continue
            }
            await prisma.deadline.create({
              data: {
                caseId: item.caseId,
                organizationId,
                dueAt: new Date(item.startsAt),
                kind: item.deadlineKind ?? 'outros',
                customLabel: item.title,
                googleEventId: item.googleEventId,
              },
            })
          }
          imported++
        } catch {
          skipped++
        }
      }

      return reply.status(200).send({ imported, skipped })
    },
  )
}
