import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { brandingForOrganization } from '@/services/tenant/organization-branding'

export const getClientDashboard: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/dashboard',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get client dashboard data',
        operationId: 'getClientDashboard',
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({
            client: z.object({
              id: z.string(),
              name: z.string(),
              mail: z.string().nullable(),
            }),
            case: z
              .object({
                id: z.string(),
                title: z.string(),
                phase: z.string(),
                processNumber: z.string().nullable(),
                openedAt: z.string(),
                lawyer: z.object({
                  name: z.string(),
                  oabNumber: z.string(),
                  phone: z.string().nullable(),
                  logoUrl: z.string().nullable(),
                }),
              })
              .nullable(),
            stats: z.object({
              pendingDocuments: z.number(),
              totalDocuments: z.number(),
              unreadNotifications: z.number(),
            }),
            nextHearing: z
              .object({
                id: z.string(),
                scheduledAt: z.string(),
                kind: z.string(),
                location: z.string().nullable(),
                link: z.string().nullable(),
              })
              .nullable(),
            recentEvents: z.array(
              z.object({
                id: z.string(),
                type: z.string(),
                title: z.string(),
                description: z.string().nullable(),
                date: z.string(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const clientId = request.user.sub

      const client = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: {
          id: true,
          name: true,
          mail: true,
          userId: true,
        },
      })

      if (!client) {
        throw new ResourceNotFoundException('Cliente não encontrado')
      }

      // `clientAuth` já validou o client e ativou o contexto de organização
      // (Client.organizationId) — a marca vem de lá, não de User.
      const branding = await brandingForOrganization(requireOrganizationId())

      const mainCase = await prisma.case.findFirst({
        where: {
          clientId: client.id,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          phase: true,
          processNumber: true,
          openedAt: true,
          assignedTo: {
            select: {
              name: true,
              oabNumber: true,
            },
          },
        },
      })

      const stats = {
        pendingDocuments: 0,
        totalDocuments: 0,
        unreadNotifications: 0,
      }

      let nextHearing: {
        id: string
        scheduledAt: string
        kind: string
        location: string | null
        link: string | null
      } | null = null

      let recentEvents: {
        id: string
        type: string
        title: string
        description: string | null
        date: string
        createdAt: string
      }[] = []

      if (mainCase) {
        const documentStats = await prisma.documentRequirement.groupBy({
          by: ['status'],
          where: { caseId: mainCase.id },
          _count: true,
        })

        stats.totalDocuments = documentStats.reduce(
          (sum, stat) => sum + stat._count,
          0,
        )
        stats.pendingDocuments =
          documentStats.find((s) => s.status === 'pendente')?._count || 0

        const upcomingHearing = await prisma.hearing.findFirst({
          where: {
            caseId: mainCase.id,
            scheduledAt: { gte: new Date() },
          },
          orderBy: { scheduledAt: 'asc' },
          select: {
            id: true,
            scheduledAt: true,
            kind: true,
            location: true,
            link: true,
          },
        })

        if (upcomingHearing) {
          nextHearing = {
            ...upcomingHearing,
            scheduledAt: upcomingHearing.scheduledAt.toISOString(),
          }
        }

        const events = await prisma.timelineEvent.findMany({
          where: {
            caseId: mainCase.id,
            isVisible: true,
          },
          orderBy: { date: 'desc' },
          take: 5,
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            date: true,
            createdAt: true,
          },
        })

        recentEvents = events.map((event) => ({
          ...event,
          date: event.date.toISOString(),
          createdAt: event.createdAt.toISOString(),
        }))
      }

      const unreadCount = await prisma.clientNotification.count({
        where: {
          clientId: client.id,
          isRead: false,
        },
      })

      stats.unreadNotifications = unreadCount

      return reply.status(200).send({
        client: {
          id: client.id,
          name: client.name,
          mail: client.mail,
        },
        case: mainCase
          ? {
              id: mainCase.id,
              title: mainCase.title,
              phase: mainCase.phase,
              processNumber: mainCase.processNumber,
              openedAt: mainCase.openedAt.toISOString(),
              lawyer: {
                ...mainCase.assignedTo,
                phone: branding?.phone ?? null,
                logoUrl: branding?.logoUrl ?? null,
              },
            }
          : null,
        stats,
        nextHearing,
        recentEvents,
      })
    },
  )
}
