import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import {
  notifyCaseClient,
  recordTimelineEvent,
} from '@/services/case-events/case-event-service'
import { getClientPhaseLabel } from '@/services/labels/case-labels'
import { assertCaseWritable } from '@/services/tenant/case-access'
import { caseVisibility } from '@/services/tenant/visibility'
import { recordActivity } from '@/utils/record-activity'
import { removeUndefined } from '@/utils/remove-undefined'

const casePhaseSchema = z.enum([
  'pre_judicial',
  'distribuido',
  'conhecimento',
  'recurso',
  'execucao',
  'encerrado',
])

const actionTypeSchema = z.enum([
  'verbas_rescisorias',
  'horas_extras',
  'equiparacao_salarial',
  'desvio_funcao',
  'danos_morais',
  'rescisao_indireta',
  'adicional_insalubridade',
  'adicional_periculosidade',
  'fgts_multa',
  'reconhecimento_vinculo',
  'outro',
])

const riskLevelSchema = z.enum(['baixo', 'medio', 'alto'])

const updateCaseBodySchema = z.object({
  title: z.string().min(1).optional(),
  clientId: z.string().nullable().optional(),
  processNumber: z.string().nullable().optional(),
  court: z.string().nullable().optional(),
  vara: z.string().nullable().optional(),
  phase: casePhaseSchema.optional(),
  actionType: actionTypeSchema.nullable().optional(),
  valorCausa: z.number().nullable().optional(),
  riskLevel: riskLevelSchema.nullable().optional(),
  observations: z.string().nullable().optional(),
  closedAt: z.string().datetime().nullable().optional(),
})

export const updateCase: FastifyPluginCallbackZod = (app) => {
  app.patch(
    '/cases/:caseId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Case'],
        summary: 'Update case',
        operationId: 'updateCase',

        params: z.object({
          caseId: z.string(),
        }),

        body: updateCaseBodySchema,

        response: {
          200: z.object({
            id: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { caseId } = request.params

      await assertCaseWritable(request.tenant, caseId)

      const {
        title,
        clientId,
        processNumber,
        court,
        vara,
        phase,
        actionType,
        valorCausa,
        riskLevel,
        observations,
        closedAt,
      } = request.body

      const existingCase = await prisma.case.findFirst({
        where: {
          id: caseId,
          ...caseVisibility(request.tenant),
          deletedAt: null,
        },
        select: {
          id: true,
          phase: true,
        },
      })

      if (!existingCase) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      const isClosedAt = closedAt !== undefined
      let parsedClosedAt: Date | null | undefined

      if (isClosedAt) {
        parsedClosedAt = closedAt ? new Date(closedAt) : null
      } else {
        parsedClosedAt = undefined
      }

      await prisma.case.update({
        where: {
          id: caseId,
        },
        data: removeUndefined({
          title,
          clientId,
          processNumber,
          court,
          vara,
          phase,
          actionType,
          valorCausa,
          riskLevel,
          observations,
          closedAt: parsedClosedAt,
        }),
      })

      const phaseChanged = phase !== undefined && phase !== existingCase.phase

      if (phaseChanged) {
        await recordActivity({
          caseId,
          userId,
          kind: 'case_phase_changed',
          payload: {
            from: existingCase.phase,
            to: phase,
          },
        })

        // Mudança de fase é o andamento que o cliente mais espera. Vira evento
        // visível na linha do tempo e aviso no sino do portal.
        const phaseLabel = getClientPhaseLabel(phase)

        await recordTimelineEvent(prisma, {
          caseId,
          type: 'status_atualizado',
          title: `Etapa atualizada: ${phaseLabel}`,
          description: `O processo passou de "${getClientPhaseLabel(
            existingCase.phase,
          )}" para "${phaseLabel}".`,
        })

        await notifyCaseClient(prisma, {
          caseId,
          type: 'timeline_event',
          title: 'Seu processo avançou',
          message: `Etapa atual: ${phaseLabel}.`,
        })
      }

      return reply.status(200).send({
        id: caseId,
      })
    },
  )
}
