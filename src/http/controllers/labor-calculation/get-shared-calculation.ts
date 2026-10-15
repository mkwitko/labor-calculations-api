import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma, systemPrisma } from 'prisma/prisma'
import z from 'zod'
import { decimalField } from '@/http/schemas/zod-helpers'
import { runAsOrganization } from '@/lib/tenant-context'
import { brandingForOrganization } from '@/services/tenant/organization-branding'

const settlementSchema = z.object({
  id: z.string(),
  agreementRate: decimalField,
  feeType: z.string(),
  feeValue: decimalField,
  agreementValue: decimalField,
  feeAmount: decimalField,
  netToClient: decimalField,
  estimatedTime: z.string(),
  status: z.string(),
  createdAt: z.date(),
})

const sharedCalculationSchema = z.object({
  id: z.string(),
  clientName: z.string(),
  clientDocument: z.string().nullable(),
  observations: z.string().nullable(),
  calculationVersion: z.string(),
  terminationType: z.enum($Enums.TerminationType),
  status: z.enum($Enums.CalculationStatus),
  createdAt: z.date(),
  updatedAt: z.date(),
  startDate: z.date(),
  endDate: z.date(),
  lastSalary: decimalField,
  baseSalary: decimalField,
  unpaid13ths: decimalField,
  vacationCount: decimalField,
  vacationVencidasCount: decimalField,
  priorNoticeWorked: z.boolean(),
  priorNoticeDate: z.date().nullable(),
  extraHours: decimalField,
  nightHours: decimalField,
  insalubrityLevel: decimalField,
  dangerousWork: z.boolean(),
  applyArt477Fine: z.boolean(),
  lastThreeSalariesAvg: decimalField,
  priorNoticeValue: decimalField,
  thirteenthSalaryValue: decimalField,
  vacationValue: decimalField,
  fgtsValue: decimalField,
  fgtsFineValue: decimalField,
  unemploymentInsuranceValue: decimalField,
  extraHoursValue: decimalField,
  nightAdditionalValue: decimalField,
  insalubrityValue: decimalField,
  dangerousWorkValue: decimalField,
  art477FineValue: decimalField,
  totalValue: decimalField,
  reflexo13thValue: decimalField,
  reflexoVacationValue: decimalField,
  reflexoFGTSValue: decimalField,
  reflexoMultaFGTSValue: decimalField,
  doubleVacationValue: decimalField,
  saldoSalarioValue: decimalField,
  correctionTotal: decimalField,
  interestTotal: decimalField,
  inssEmployeeValue: decimalField,
  inssEmployerValue: decimalField,
  satRatValue: decimalField,
  irpfValue: decimalField,
  custasJudiciaisValue: decimalField,
  honorariosSucumbenciaValue: decimalField,
  honorariosIrpfValue: decimalField,
  honorariosLiquidosValue: decimalField,
  brutoDevidoReclamante: decimalField,
  totalDescontos: decimalField,
  liquidoDevidoReclamante: decimalField,
  totalDevidoReclamado: decimalField,
  percentualRemuneratorio: decimalField,

  fgtsEntries: z.array(
    z.object({
      month: z.date(),
      base: z.number(),
      aliquot: z.number(),
      deposit: z.number(),
      corrected: z.number(),
      correctionAmount: z.number(),
      interest: z.number(),
      total: z.number(),
    }),
  ),
  settlements: z.array(settlementSchema),
  user: z.object({
    id: z.string(),
    name: z.string(),
    officeName: z.string().nullable(),
    logoUrl: z.string().nullable(),
  }),
})

export const getSharedCalculation: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/shared-calculation/:id',
    {
      schema: {
        tags: ['SharedCalculation'],
        summary: 'Get shared calculation by id and code',
        operationId: 'getSharedCalculation',
        params: z.object({
          id: z.string(),
        }),
        querystring: z.object({
          code: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string().optional(),
            data: sharedCalculationSchema.optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { code } = request.query

      // Link público: id + shareCode substituem autenticação, então não há
      // hook de auth aqui e, consequentemente, nenhum contexto de tenant
      // ainda. LaborCalculation é modelo tenant, então essa primeira busca
      // (só para descobrir a organização e validar o código) usa
      // systemPrisma.
      const shareLookup = await systemPrisma.laborCalculation.findFirst({
        where: { id },
        select: { organizationId: true, shareCode: true },
      })

      if (!shareLookup) {
        return reply.status(200).send({ success: false, message: 'Not found' })
      }

      if (!shareLookup.shareCode || shareLookup.shareCode !== code) {
        return reply
          .status(200)
          .send({ success: false, message: 'Invalid share code' })
      }

      // Código validado: o restante da leitura roda no contexto da
      // organização dona do cálculo, com o client normal (com escopo).
      const calculation = await runAsOrganization(
        shareLookup.organizationId,
        async () =>
          await prisma.laborCalculation.findFirst({
            where: { id },
            include: {
              fgtsEntries: true,
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
              settlements: {
                select: {
                  id: true,
                  agreementRate: true,
                  feeType: true,
                  feeValue: true,
                  agreementValue: true,
                  feeAmount: true,
                  netToClient: true,
                  estimatedTime: true,
                  status: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
              },
            },
          }),
      )

      if (!calculation) {
        return reply.status(200).send({ success: false, message: 'Not found' })
      }

      // Link público, sem contexto de organização ativo neste ponto (o
      // `runAsOrganization` acima já fechou) — a marca vem da organização
      // dona do cálculo (`shareLookup.organizationId`, já resolvida acima),
      // não de quem o criou. `brandingForUser` resolveria pela regra de
      // "owner de alguma organização", que falha para qualquer advogado
      // (lawyer/admin) que não seja o owner do escritório — exatamente o
      // caso comum num escritório com vários assentos.
      const branding = await brandingForOrganization(shareLookup.organizationId)

      return reply.status(200).send({
        success: true,
        data: {
          ...calculation,
          user: {
            ...calculation.user,
            officeName: branding?.officeName ?? null,
            logoUrl: branding?.logoUrl ?? null,
          },
        },
      })
    },
  )
}
