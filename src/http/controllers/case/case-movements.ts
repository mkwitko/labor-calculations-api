import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  datajudAliasFor,
  fetchDataJudMovements,
} from '@/services/datajud/datajud-service'
import {
  assertCaseVisible,
  assertCaseWritable,
  findVisibleCase,
} from '@/services/tenant/case-access'

const movementSchema = z.object({
  id: z.string(),
  date: z.date(),
  code: z.string().nullable(),
  description: z.string(),
  source: z.enum($Enums.MovementSource),
  createdAt: z.date(),
})

// Case process movements (andamentos). Manual entries + sync from CNJ DataJud.
export const caseMovementsRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/movements',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseMovement'],
        summary: 'List case movements',
        operationId: 'listCaseMovements',
        params: z.object({ caseId: z.string() }),
        response: { 200: z.array(movementSchema) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      await assertCaseVisible(request.tenant, caseId)
      const movements = await prisma.caseMovement.findMany({
        where: { caseId },
        orderBy: { date: 'desc' },
      })
      return reply.status(200).send(movements)
    },
  )

  app.post(
    '/cases/:caseId/movements',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseMovement'],
        summary: 'Add a manual case movement',
        operationId: 'createCaseMovement',
        params: z.object({ caseId: z.string() }),
        body: z.object({
          date: z.coerce.date(),
          description: z.string().min(1),
          code: z.string().optional(),
        }),
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      await assertCaseWritable(request.tenant, caseId)
      const b = request.body
      const created = await prisma.caseMovement.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          date: b.date,
          description: b.description,
          code: b.code ?? null,
          source: 'manual',
        },
        select: { id: true },
      })
      return reply.status(201).send(created)
    },
  )

  app.post(
    '/cases/:caseId/movements/sync',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseMovement'],
        summary: 'Sync movements from CNJ DataJud by process number',
        operationId: 'syncCaseMovements',
        params: z.object({ caseId: z.string() }),
        response: {
          200: z.object({ imported: z.number(), total: z.number() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      await assertCaseWritable(request.tenant, caseId)

      const found = await findVisibleCase(request.tenant, caseId, {
        id: true,
        processNumber: true,
      })

      if (!found) throw new ResourceNotFoundException('Caso não encontrado')

      if (!found.processNumber) {
        throw new BadRequestException(
          'Informe o número do processo (CNJ) no caso antes de sincronizar.',
        )
      }

      // Número que não é da Justiça do Trabalho não tem índice no DataJud, e a
      // busca voltaria vazia. Sem esta checagem a tela dizia "nenhum andamento
      // novo encontrado" — a mesma resposta de um processo trabalhista sem
      // movimentação nova, e quem digitou o número errado não descobria.
      if (!datajudAliasFor(found.processNumber)) {
        throw new BadRequestException(
          'A consulta ao DataJud cobre apenas processos da Justiça do Trabalho (TRT e TST). Confira o número informado.',
        )
      }

      const movements = await fetchDataJudMovements(found.processNumber)
      if (movements.length === 0) {
        return reply.status(200).send({ imported: 0, total: 0 })
      }

      const organizationId = requireOrganizationId()
      const result = await prisma.caseMovement.createMany({
        data: movements.map((m) => ({
          caseId,
          organizationId,
          date: m.date,
          code: m.code,
          description: m.description,
          source: 'datajud' as const,
          externalId: m.externalId,
        })),
        skipDuplicates: true,
      })

      return reply
        .status(200)
        .send({ imported: result.count, total: movements.length })
    },
  )

  app.delete(
    '/cases/:caseId/movements/:movementId',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseMovement'],
        summary: 'Delete a case movement',
        operationId: 'deleteCaseMovement',
        params: z.object({ caseId: z.string(), movementId: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { caseId, movementId } = request.params
      await assertCaseWritable(request.tenant, caseId)
      await prisma.caseMovement.deleteMany({
        where: { id: movementId, caseId },
      })
      return reply.status(204).send(null)
    },
  )
}
