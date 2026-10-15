import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  assertCaseVisible,
  assertCaseWritable,
} from '@/services/tenant/case-access'

const partySchema = z.object({
  id: z.string(),
  role: z.enum($Enums.PartyRole),
  name: z.string(),
  document: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
})

const bodySchema = z.object({
  role: z.enum($Enums.PartyRole),
  name: z.string().min(1),
  document: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
})

// CRUD for case parties (reclamante, reclamada, testemunha, paradigma, ...).
export const casePartiesRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/parties',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseParty'],
        summary: 'List case parties',
        operationId: 'listCaseParties',
        params: z.object({ caseId: z.string() }),
        response: { 200: z.array(partySchema) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      await assertCaseVisible(request.tenant, caseId)
      const parties = await prisma.caseParty.findMany({
        where: { caseId },
        orderBy: { createdAt: 'asc' },
      })
      return reply.status(200).send(parties)
    },
  )

  app.post(
    '/cases/:caseId/parties',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseParty'],
        summary: 'Create case party',
        operationId: 'createCaseParty',
        params: z.object({ caseId: z.string() }),
        body: bodySchema,
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      await assertCaseWritable(request.tenant, caseId)
      const b = request.body
      const party = await prisma.caseParty.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          role: b.role,
          name: b.name,
          document: b.document ?? null,
          email: b.email ?? null,
          phone: b.phone ?? null,
          notes: b.notes ?? null,
        },
        select: { id: true },
      })
      return reply.status(201).send(party)
    },
  )

  app.patch(
    '/cases/:caseId/parties/:partyId',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseParty'],
        summary: 'Update case party',
        operationId: 'updateCaseParty',
        params: z.object({ caseId: z.string(), partyId: z.string() }),
        body: bodySchema.partial(),
        response: {
          200: z.object({ id: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId, partyId } = request.params
      await assertCaseWritable(request.tenant, caseId)
      const existing = await prisma.caseParty.findFirst({
        where: { id: partyId, caseId },
        select: { id: true },
      })
      if (!existing) throw new ResourceNotFoundException('Parte não encontrada')
      await prisma.caseParty.update({
        where: { id: partyId },
        data: request.body,
      })
      return reply.status(200).send({ id: partyId })
    },
  )

  app.delete(
    '/cases/:caseId/parties/:partyId',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseParty'],
        summary: 'Delete case party',
        operationId: 'deleteCaseParty',
        params: z.object({ caseId: z.string(), partyId: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { caseId, partyId } = request.params
      await assertCaseWritable(request.tenant, caseId)
      await prisma.caseParty.deleteMany({ where: { id: partyId, caseId } })
      return reply.status(204).send(null)
    },
  )
}
