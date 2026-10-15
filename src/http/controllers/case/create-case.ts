import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireSubscription } from '@/http/hooks/require-subscription'
import { requireOrganizationId } from '@/lib/tenant-context'
import { calculationVisibility } from '@/services/tenant/visibility'
import { recordActivity } from '@/utils/record-activity'

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

export const createCase: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/cases',
    {
      preHandler: [auth, requireSubscription],
      schema: {
        tags: ['Case'],
        summary: 'Create case',
        operationId: 'createCase',
        body: z.object({
          title: z.string().min(1),
          clientId: z.string().optional(),
          processNumber: z.string().optional(),
          court: z.string().optional(),
          vara: z.string().optional(),
          phase: casePhaseSchema.optional(),
          actionType: actionTypeSchema.optional(),
          valorCausa: z.number().min(0).optional(),
          observations: z.string().optional(),
          openedAt: z.string().datetime().optional(),
          // Vincular na criação em vez de exigir uma segunda chamada: o caso
          // quase sempre nasce de um cálculo já feito, e um caso sem cálculo,
          // ainda que por um instante, é um estado que ninguém quis.
          calculationId: z.string().optional(),
        }),
        response: {
          201: z.object({ id: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const {
        title,
        clientId,
        processNumber,
        court,
        vara,
        phase,
        actionType,
        valorCausa,
        observations,
        openedAt,
        calculationId,
      } = request.body

      // Confere o cálculo ANTES de criar o caso: se o id não existe ou o papel
      // não o enxerga, é 404 e nada foi criado — melhor que um caso órfão de um
      // vínculo que falhou.
      if (calculationId) {
        const calculation = await prisma.laborCalculation.findFirst({
          where: {
            id: calculationId,
            ...calculationVisibility(request.tenant),
            deletedAt: null,
          },
          select: { id: true },
        })

        if (!calculation) {
          throw new ResourceNotFoundException('Cálculo não encontrado')
        }
      }

      const newCase = await prisma.case.create({
        data: {
          assignedToId: userId,
          organizationId: requireOrganizationId(),
          title,
          clientId,
          processNumber,
          court,
          vara,
          phase: phase ?? 'pre_judicial',
          actionType,
          valorCausa,
          observations,
          openedAt: openedAt ? new Date(openedAt) : new Date(),
        },
        select: { id: true },
      })

      await recordActivity({ caseId: newCase.id, userId, kind: 'case_created' })

      if (calculationId) {
        await prisma.laborCalculation.update({
          where: { id: calculationId },
          data: { caseId: newCase.id },
        })

        // Mesma atividade que `POST /cases/:caseId/calculations/:calcId` grava,
        // para que a linha do tempo não dependa de por onde o vínculo veio.
        await recordActivity({
          caseId: newCase.id,
          userId,
          kind: 'calc_linked',
          payload: { calcId: calculationId },
        })
      }

      return reply.status(201).send({ id: newCase.id })
    },
  )
}
