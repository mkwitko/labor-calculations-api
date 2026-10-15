import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { decimalField } from '@/http/schemas/zod-helpers'
import { requireOrganizationId } from '@/lib/tenant-context'
import type { TenantActor } from '@/services/tenant/actor'
import { assertFinanceAccess } from '@/services/tenant/case-access'
import { calculationVisibility } from '@/services/tenant/visibility'

const installmentSchema = z.object({
  id: z.string(),
  number: z.number(),
  dueDate: z.date(),
  amount: decimalField,
  paidAt: z.date().nullable(),
})

/**
 * Parcela de acordo é financeiro: o portão do papel vem antes do acordo, para
 * não revelar a existência do acordo a quem não tem financeiro.
 */
async function assertSettlementAccessible(
  actor: TenantActor,
  settlementId: string,
) {
  assertFinanceAccess(actor)

  const found = await prisma.settlement.findFirst({
    where: {
      id: settlementId,
      laborCalculation: calculationVisibility(actor),
    },
    select: { id: true, agreementValue: true },
  })
  if (!found) throw new ResourceNotFoundException('Acordo não encontrado')
  return found
}

export const settlementInstallmentsRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/settlements/:settlementId/installments',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlement'],
        summary: 'List settlement installments',
        operationId: 'listSettlementInstallments',
        params: z.object({ settlementId: z.string() }),
        response: { 200: z.array(installmentSchema) },
      },
    },
    async (request, reply) => {
      const { settlementId } = request.params
      await assertSettlementAccessible(request.tenant, settlementId)
      const rows = await prisma.settlementInstallment.findMany({
        where: { settlementId },
        orderBy: { number: 'asc' },
      })
      return reply.status(200).send(rows)
    },
  )

  // Generate an equal-value installment schedule (replaces any existing one).
  app.post(
    '/settlements/:settlementId/installments/generate',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlement'],
        summary: 'Generate an installment schedule for the settlement',
        operationId: 'generateSettlementInstallments',
        params: z.object({ settlementId: z.string() }),
        body: z.object({
          count: z.number().int().min(1).max(120),
          firstDueDate: z.coerce.date(),
        }),
        response: { 200: z.object({ created: z.number() }) },
      },
    },
    async (request, reply) => {
      const { settlementId } = request.params
      const settlement = await assertSettlementAccessible(
        request.tenant,
        settlementId,
      )
      const { count, firstDueDate } = request.body

      const total = Number(settlement.agreementValue)
      const base = Math.floor((total / count) * 100) / 100
      // Last installment absorbs the rounding remainder.
      const last = Math.round((total - base * (count - 1)) * 100) / 100

      const organizationId = requireOrganizationId()
      const rows = Array.from({ length: count }, (_, i) => {
        const due = new Date(firstDueDate)
        due.setMonth(due.getMonth() + i)
        return {
          settlementId,
          organizationId,
          number: i + 1,
          dueDate: due,
          amount: i === count - 1 ? last : base,
        }
      })

      const result = await prisma.$transaction(async (tx) => {
        await tx.settlementInstallment.deleteMany({ where: { settlementId } })
        return tx.settlementInstallment.createMany({ data: rows })
      })

      return reply.status(200).send({ created: result.count })
    },
  )

  app.patch(
    '/settlements/:settlementId/installments/:installmentId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlement'],
        summary: 'Mark an installment paid/unpaid',
        operationId: 'updateSettlementInstallment',
        params: z.object({
          settlementId: z.string(),
          installmentId: z.string(),
        }),
        body: z.object({ paid: z.boolean() }),
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const { settlementId, installmentId } = request.params
      await assertSettlementAccessible(request.tenant, settlementId)
      await prisma.settlementInstallment.updateMany({
        where: { id: installmentId, settlementId },
        data: { paidAt: request.body.paid ? new Date() : null },
      })
      return reply.status(200).send({ id: installmentId })
    },
  )
}
