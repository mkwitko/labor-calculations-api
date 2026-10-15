import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { decimalField } from '@/http/schemas/zod-helpers'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  assertCaseVisible,
  assertFinanceAccess,
} from '@/services/tenant/case-access'

const feeSchema = z.object({
  id: z.string(),
  feeType: z.enum($Enums.FeeType),
  percent: decimalField.nullable(),
  fixedValue: decimalField.nullable(),
  notes: z.string().nullable(),
})

// Fee agreement (honorários contratuais) — one per case, get + upsert.
export const caseFinanceRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/fee-agreement',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseFinance'],
        summary: 'Get case fee agreement',
        operationId: 'getCaseFeeAgreement',
        params: z.object({ caseId: z.string() }),
        response: { 200: feeSchema.nullable() },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      assertFinanceAccess(request.tenant)
      await assertCaseVisible(request.tenant, caseId)
      const fee = await prisma.feeAgreement.findUnique({ where: { caseId } })
      return reply.status(200).send(fee)
    },
  )

  app.put(
    '/cases/:caseId/fee-agreement',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseFinance'],
        summary: 'Create or update the case fee agreement',
        operationId: 'upsertCaseFeeAgreement',
        params: z.object({ caseId: z.string() }),
        body: z.object({
          feeType: z.enum($Enums.FeeType),
          percent: z.number().min(0).max(100).nullable().optional(),
          fixedValue: z.number().min(0).nullable().optional(),
          notes: z.string().optional(),
        }),
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      assertFinanceAccess(request.tenant)
      await assertCaseVisible(request.tenant, caseId)
      const b = request.body
      const data = {
        feeType: b.feeType,
        percent: b.percent ?? null,
        fixedValue: b.fixedValue ?? null,
        notes: b.notes ?? null,
      }
      const fee = await prisma.feeAgreement.upsert({
        where: { caseId },
        create: { caseId, organizationId: requireOrganizationId(), ...data },
        update: data,
        select: { id: true },
      })
      return reply.status(200).send(fee)
    },
  )
}
