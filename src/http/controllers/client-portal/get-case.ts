import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { brandingForOrganization } from '@/services/tenant/organization-branding'

export const getClientCase: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases/:caseId',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Get case details for client',
        operationId: 'getClientCase',
        security: [{ BearerAuth: [] }],
        params: z.object({
          caseId: z.string().cuid(),
        }),
        response: {
          200: z.object({
            id: z.string(),
            title: z.string(),
            phase: z.string(),
            processNumber: z.string().nullable(),
            court: z.string().nullable(),
            vara: z.string().nullable(),
            observations: z.string().nullable(),
            openedAt: z.string(),
            closedAt: z.string().nullable(),
            lawyer: z.object({
              name: z.string(),
              oabNumber: z.string(),
              phone: z.string().nullable(),
              mail: z.string(),
              logoUrl: z.string().nullable(),
              officeName: z.string().nullable(),
            }),
            nextHearing: z
              .object({
                id: z.string(),
                scheduledAt: z.string(),
                kind: z.string(),
                location: z.string().nullable(),
                link: z.string().nullable(),
                notes: z.string().nullable(),
              })
              .nullable(),
            nextDeadline: z
              .object({
                id: z.string(),
                dueAt: z.string(),
                kind: z.string(),
                customLabel: z.string().nullable(),
              })
              .nullable(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      const clientId = request.user.sub

      // Verify case belongs to client
      const caseData = await prisma.case.findFirst({
        where: {
          id: caseId,
          clientId: clientId,
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          phase: true,
          processNumber: true,
          court: true,
          vara: true,
          observations: true,
          openedAt: true,
          closedAt: true,
          assignedTo: {
            select: {
              name: true,
              oabNumber: true,
              mail: true,
            },
          },
        },
      })

      if (!caseData) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      // `clientAuth` já validou o client e ativou o contexto de organização
      // (Client.organizationId) — a marca vem de lá, não de User.
      const branding = await brandingForOrganization(requireOrganizationId())

      // Get next hearing
      const nextHearing = await prisma.hearing.findFirst({
        where: {
          caseId: caseData.id,
          scheduledAt: { gte: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true,
          scheduledAt: true,
          kind: true,
          location: true,
          link: true,
          notes: true,
        },
      })

      // Get next deadline
      const nextDeadline = await prisma.deadline.findFirst({
        where: {
          caseId: caseData.id,
          dueAt: { gte: new Date() },
          doneAt: null,
        },
        orderBy: { dueAt: 'asc' },
        select: {
          id: true,
          dueAt: true,
          kind: true,
          customLabel: true,
        },
      })

      return reply.status(200).send({
        ...caseData,
        openedAt: caseData.openedAt.toISOString(),
        closedAt: caseData.closedAt?.toISOString() || null,
        lawyer: {
          ...caseData.assignedTo,
          phone: branding?.phone ?? null,
          logoUrl: branding?.logoUrl ?? null,
          officeName: branding?.officeName ?? null,
        },
        nextHearing: nextHearing
          ? {
              ...nextHearing,
              scheduledAt: nextHearing.scheduledAt.toISOString(),
            }
          : null,
        nextDeadline: nextDeadline
          ? {
              ...nextDeadline,
              dueAt: nextDeadline.dueAt.toISOString(),
            }
          : null,
      })
    },
  )
}
