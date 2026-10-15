import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { decimalField } from '@/http/schemas/zod-helpers'
import { caseVisibility } from '@/services/tenant/visibility'

const casePhaseSchema = z.enum([
  'pre_judicial',
  'distribuido',
  'conhecimento',
  'recurso',
  'execucao',
  'encerrado',
])

const caseDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  processNumber: z.string().nullable(),
  court: z.string().nullable(),
  vara: z.string().nullable(),
  phase: casePhaseSchema,
  actionType: z.string().nullable(),
  valorCausa: decimalField.nullable(),
  riskLevel: z.string().nullable(),
  observations: z.string().nullable(),
  openedAt: z.date(),
  closedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  client: z
    .object({
      id: z.string(),
      name: z.string(),
      document: z.string().nullable(),
      mail: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable(),
  calculations: z.array(
    z.object({
      id: z.string(),
      clientName: z.string(),
      terminationType: z.string(),
      status: z.string(),
      calculationVersion: z.string(),
      totalValue: decimalField.nullable(),
      createdAt: z.date(),
    }),
  ),
  settlements: z.array(
    z.object({
      id: z.string(),
      agreementValue: decimalField,
      status: z.string(),
      createdAt: z.date(),
      laborCalculationId: z.string(),
    }),
  ),
  hearings: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      scheduledAt: z.date(),
      location: z.string().nullable(),
      link: z.string().nullable(),
      notes: z.string().nullable(),
      createdAt: z.date(),
    }),
  ),
  deadlines: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      dueAt: z.date(),
      customLabel: z.string().nullable(),
      doneAt: z.date().nullable(),
      autoCalculatedFromHearingId: z.string().nullable(),
      createdAt: z.date(),
    }),
  ),
  documents: z.array(
    z.object({
      id: z.string(),
      fileName: z.string(),
      kind: z.string(),
      mimeType: z.string(),
      fileKey: z.string(),
      sizeBytes: z.number().int(),
      createdAt: z.date(),
    }),
  ),
})

export const getCase: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Get case by id',
        operationId: 'getCase',
        params: z.object({ caseId: z.string() }),
        response: {
          200: caseDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      const found = await prisma.case.findFirst({
        where: {
          id: caseId,
          ...caseVisibility(request.tenant),
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          processNumber: true,
          court: true,
          vara: true,
          phase: true,
          actionType: true,
          valorCausa: true,
          riskLevel: true,
          observations: true,
          openedAt: true,
          closedAt: true,
          createdAt: true,
          updatedAt: true,
          client: {
            select: {
              id: true,
              name: true,
              document: true,
              mail: true,
              phone: true,
            },
          },
          calculations: {
            where: { deletedAt: null },
            select: {
              id: true,
              clientName: true,
              terminationType: true,
              status: true,
              calculationVersion: true,
              totalValue: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          hearings: {
            orderBy: { scheduledAt: 'asc' },
            select: {
              id: true,
              kind: true,
              scheduledAt: true,
              location: true,
              link: true,
              notes: true,
              createdAt: true,
            },
          },
          deadlines: {
            orderBy: { dueAt: 'asc' },
            select: {
              id: true,
              kind: true,
              dueAt: true,
              customLabel: true,
              doneAt: true,
              autoCalculatedFromHearingId: true,
              createdAt: true,
            },
          },
          documents: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              fileName: true,
              kind: true,
              mimeType: true,
              fileKey: true,
              sizeBytes: true,
              createdAt: true,
            },
          },
        },
      })

      if (!found) throw new ResourceNotFoundException('Caso não encontrado')

      const calcIds = found.calculations.map((c) => c.id)
      const settlements = await prisma.settlement.findMany({
        where: { laborCalculationId: { in: calcIds } },
        select: {
          id: true,
          agreementValue: true,
          status: true,
          createdAt: true,
          laborCalculationId: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      return reply.status(200).send({
        ...found,
        calculations: found.calculations.map((c) => ({
          ...c,
          totalValue: c.totalValue?.toNumber() ?? null,
        })),
        settlements: settlements.map((s) => ({
          ...s,
          agreementValue: s.agreementValue.toNumber(),
        })),
        hearings: found.hearings,
        deadlines: found.deadlines,
        documents: found.documents,
      })
    },
  )
}
