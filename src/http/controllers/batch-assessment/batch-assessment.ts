import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { decimalField } from '@/http/schemas/zod-helpers'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  appendBatchRows,
  createBatchAssessment,
  deleteBatchAssessment,
  getBatchAssessment,
  getBatchRowBreakdown,
  listBatchAssessments,
  MAX_ROWS_PER_REQUEST,
} from '@/services/batch-assessment/batch-assessment-service'
import { assertPlanFeature } from '@/services/billing/plan-features'

const rowSchema = z.object({
  reference: z.string().min(1).max(120),
  terminationType: z.enum([
    'sem_justa_causa',
    'com_justa_causa',
    'pedido_demissao',
    'rescisao_indireta',
  ]),
  startDate: z.string().date(),
  endDate: z.string().date(),
  lastSalary: z.number().positive().max(1_000_000),
  registeredContract: z.boolean().default(true),
  priorNoticeWorked: z.boolean().default(false),
  unpaid13ths: z.number().min(0).max(10).default(0),
  vacationVencidasCount: z.number().min(0).max(10).default(0),
  extraHours: z.enum(['sim', 'nao', 'nao_sei']).default('nao'),
  nightWork: z.enum(['sim', 'nao', 'nao_sei']).default('nao'),
  insalubrity: z.enum(['sim', 'nao', 'nao_sei']).default('nao'),
  dangerousWork: z.enum(['sim', 'nao', 'nao_sei']).default('nao'),
})

const batchSchema = z.object({
  id: z.string(),
  name: z.string(),
  clientId: z.string().nullable(),
  rowCount: z.number(),
  failedCount: z.number(),
  severanceCost: decimalField,
  exposure: decimalField,
  gap: decimalField,
  createdAt: z.date(),
})

const rowResponseSchema = z.object({
  id: z.string(),
  order: z.number(),
  reference: z.string(),
  severanceCost: decimalField.nullable(),
  exposure: decimalField.nullable(),
  gap: decimalField.nullable(),
  error: z.string().nullable(),
})

/** Mesma régua de criar cálculo: estagiário não avalia passivo de cliente. */
const WRITERS = ['owner', 'admin', 'lawyer'] as const

export const batchAssessmentRoutes: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/batch-assessments',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['BatchAssessment'],
        summary: 'Cria uma avaliação de passivo a partir de uma folha',
        operationId: 'createBatchAssessment',
        body: z.object({
          name: z.string().min(2).max(160),
          clientId: z.string().optional(),
          rows: z.array(rowSchema).min(1).max(MAX_ROWS_PER_REQUEST),
        }),
        response: { 201: batchSchema },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, ...WRITERS)
      // Recurso de plano: o gate é aqui, na criação, e de novo no `append`,
      // porque folha grande sobe em partes e a segunda parte é outra requisição.
      await assertPlanFeature(requireOrganizationId(), 'batch_assessment')

      const batch = await createBatchAssessment({
        userId: request.user.sub,
        ...request.body,
      })

      return reply.status(201).send(batch)
    },
  )

  app.post(
    '/batch-assessments/:id/rows',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['BatchAssessment'],
        summary:
          'Acrescenta linhas a uma avaliação — folha grande vem em partes',
        operationId: 'appendBatchAssessmentRows',
        params: z.object({ id: z.string() }),
        body: z.object({
          rows: z.array(rowSchema).min(1).max(MAX_ROWS_PER_REQUEST),
        }),
        response: { 200: batchSchema },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, ...WRITERS)
      await assertPlanFeature(requireOrganizationId(), 'batch_assessment')

      const batch = await appendBatchRows({
        batchId: request.params.id,
        rows: request.body.rows,
      })

      return reply.status(200).send(batch)
    },
  )

  app.get(
    '/batch-assessments',
    {
      preHandler: [auth],
      schema: {
        tags: ['BatchAssessment'],
        summary: 'Lista as avaliações de passivo da organização',
        operationId: 'listBatchAssessments',
        response: {
          200: z.array(
            batchSchema.extend({
              client: z.object({ id: z.string(), name: z.string() }).nullable(),
            }),
          ),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send(await listBatchAssessments())
    },
  )

  app.get(
    '/batch-assessments/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['BatchAssessment'],
        summary: 'Avaliação com as linhas ordenadas por exposição',
        operationId: 'getBatchAssessment',
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({
            batch: batchSchema.extend({
              client: z.object({ id: z.string(), name: z.string() }).nullable(),
            }),
            rows: z.array(rowResponseSchema),
          }),
        },
      },
    },
    async (request, reply) => {
      return reply.status(200).send(await getBatchAssessment(request.params.id))
    },
  )

  const breakdownVerbaSchema = z.object({
    name: z.string(),
    legalRef: z.string().optional(),
    total: z.number(),
    certainty: z.enum(['documental', 'requer_prova']),
  })

  app.get(
    '/batch-assessments/:batchId/rows/:rowId',
    {
      // Leitura sem assertRole de propósito: mesma régua do GET do lote
      // (todo papel lê).
      preHandler: [auth],
      schema: {
        tags: ['BatchAssessment'],
        summary:
          'Demonstrativo de uma linha: verbas que compõem custo e exposição',
        operationId: 'getBatchAssessmentRowBreakdown',
        params: z.object({ batchId: z.string(), rowId: z.string() }),
        response: {
          200: z.object({
            reference: z.string(),
            severanceCost: z.number(),
            exposure: z.number(),
            gap: z.number(),
            employerCharges: z.number(),
            litigationExtras: z.number(),
            verbas: z.array(breakdownVerbaSchema),
          }),
        },
      },
    },
    async (request, reply) => {
      return reply.status(200).send(await getBatchRowBreakdown(request.params))
    },
  )

  app.delete(
    '/batch-assessments/:id',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['BatchAssessment'],
        summary: 'Exclui uma avaliação de passivo',
        operationId: 'deleteBatchAssessment',
        params: z.object({ id: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, ...WRITERS)

      await deleteBatchAssessment(request.params.id)

      return reply.status(204).send(null)
    },
  )
}
