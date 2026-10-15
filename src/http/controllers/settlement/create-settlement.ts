import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { settlementBodySchema } from '@/http/schemas/settlement-schema'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  createClientNotification,
  notifyCaseClient,
} from '@/services/case-events/case-event-service'
import { calculateSettlement } from '@/services/settlement/settlement-service'
import { calculationVisibility } from '@/services/tenant/visibility'
import { formatBrl } from '@/utils/format-ptbr'

export const createSettlement: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/labor-calculation/:laborCalculationId/settlements',
    {
      preHandler: [auth],
      schema: {
        tags: ['Settlements'],
        summary: 'Create a settlement',
        operationId: 'createSettlement',
        params: z.object({
          laborCalculationId: z.string(),
        }),
        body: settlementBodySchema,
        response: {
          201: z.object({ id: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { laborCalculationId } = request.params
      const { agreementRate, feeType, feeValue } = request.body

      assertRole(request.tenant, 'owner', 'admin', 'lawyer')

      const calculation = await prisma.laborCalculation.findFirst({
        where: {
          id: laborCalculationId,
          ...calculationVisibility(request.tenant),
        },
      })

      if (!calculation) {
        return reply.status(404).send({ message: 'Calculation not found' })
      }

      const { agreementValue, feeAmount, netToClient, estimatedTime } =
        calculateSettlement({
          totalValue: Number(calculation.totalValue) || 0,
          terminationType: calculation.terminationType,
          agreementRate,
          feeType,
          feeValue,
        })

      const settlement = await prisma.settlement.create({
        data: {
          laborCalculationId,
          organizationId: requireOrganizationId(),
          agreementRate,
          feeType,
          feeValue,
          agreementValue,
          feeAmount,
          netToClient,
          estimatedTime,
        },
      })

      // O acordo pende de um cálculo, não de um caso: quando o cálculo está
      // ligado a um caso o aviso vai pelo caso; cálculo solto avisa o cliente
      // direto, porque o portal também lista cálculos.
      const message = `Uma proposta de acordo de ${formatBrl(
        agreementValue,
      )} foi enviada para a sua análise.`

      if (calculation.caseId) {
        await notifyCaseClient(prisma, {
          caseId: calculation.caseId,
          type: 'settlement_received',
          title: 'Proposta de acordo recebida',
          message,
        })
      } else if (calculation.clientId) {
        await createClientNotification(prisma, {
          clientId: calculation.clientId,
          type: 'settlement_received',
          title: 'Proposta de acordo recebida',
          message,
          link: `/portal/calculos/${laborCalculationId}`,
        })
      }

      return reply.status(201).send({ id: settlement.id })
    },
  )
}
