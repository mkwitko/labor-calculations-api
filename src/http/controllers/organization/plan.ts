import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { HttpException } from '@/http/exceptions/http-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'
import { changePlan } from '@/services/billing/change-plan'
import {
  PLAN_CODES,
  PLAN_INTERVALS,
  type PlanCode,
  type PlanInterval,
} from '@/services/billing/list-plans'
import { planOccupancy } from '@/services/billing/plan-access'
import { listPlanFeatures } from '@/services/billing/plan-features'
import { previewPlanChange } from '@/services/billing/plan-preview'
import type { TenantActor } from '@/services/tenant/actor'
import {
  assertManageMembers,
  assertSameOrganization,
} from '@/services/tenant/organization-access'

function requireTenant(tenant: TenantActor | undefined): TenantActor {
  if (!tenant) throw new UnauthorizedException()

  return tenant
}

const planCode = z.enum(PLAN_CODES)
const planInterval = z.enum(PLAN_INTERVALS)

/**
 * O Stripe fora do ar vira 503, não 500: o serviço está de pé, o meio de
 * pagamento é que não respondeu. E aqui a falha aparece de propósito — mostrar
 * valor chutado num dialog de cobrança é pior que dizer que não deu para
 * calcular.
 */
function asStripeOutage(error: unknown, message: string): never {
  if (error instanceof HttpException) throw error

  throw new HttpException(503, message, 'ServiceUnavailableException')
}

export const organizationPlan: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/organizations/:organizationId/plan',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'Read the current plan and how much of it is occupied',
        security: [{ BearerAuth: [] }],
        operationId: 'getOrganizationPlan',
        params: z.object({ organizationId: z.string() }),
        response: {
          200: z.object({
            data: z.object({
              code: planCode,
              name: z.string(),
              maxMembers: z.number(),
              members: z.number(),
              pendingInvites: z.number(),
              remaining: z.number(),
              /** Se passar do teto é possível pagando por cabeça. */
              allowsExtraMembers: z.boolean(),
              extraMembers: z.number(),
              /**
               * Recursos que dependem do plano. A tela usa isto para não
               * oferecer o que a API vai recusar — mas quem recusa é a API.
               */
              features: z.record(
                z.string(),
                z.object({
                  allowed: z.boolean(),
                  requiredPlan: planCode,
                  requiredPlanName: z.string().nullable(),
                }),
              ),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)

      assertSameOrganization(tenant, request.params.organizationId)

      try {
        const [occupancy, features] = await Promise.all([
          planOccupancy(tenant.organizationId),
          listPlanFeatures(tenant.organizationId),
        ])

        if (!occupancy) {
          throw new HttpException(
            503,
            'Não foi possível ler o plano no Stripe',
            'ServiceUnavailableException',
          )
        }

        return reply.status(200).send({
          data: {
            code: occupancy.plan.code,
            name: occupancy.plan.name,
            maxMembers: occupancy.maxMembers,
            members: occupancy.members,
            pendingInvites: occupancy.pendingInvites,
            remaining: occupancy.remaining,
            allowsExtraMembers: occupancy.allowsExtraMembers,
            extraMembers: occupancy.extraMembers,
            features,
          },
        })
      } catch (error) {
        request.log.error({ err: error }, 'falha ao ler plano da organização')

        return asStripeOutage(error, 'Não foi possível ler o plano no Stripe')
      }
    },
  )

  app.get(
    '/organizations/:organizationId/plan/preview',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'Preview the cost of moving to another plan',
        security: [{ BearerAuth: [] }],
        operationId: 'previewPlan',
        params: z.object({ organizationId: z.string() }),
        querystring: z.object({ code: planCode, interval: planInterval }),
        response: {
          200: z.object({
            data: z.object({
              code: planCode,
              interval: planInterval,
              planAmountCents: z.number(),
              amountDueCents: z.number().nullable(),
              currency: z.string(),
              prorated: z.boolean(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)

      assertSameOrganization(tenant, request.params.organizationId)
      assertManageMembers(tenant)

      const { code, interval } = request.query

      try {
        const preview = await previewPlanChange(
          tenant.organizationId,
          code as PlanCode,
          interval as PlanInterval,
        )

        return reply.status(200).send({ data: preview })
      } catch (error) {
        request.log.error({ err: error }, 'falha ao prever troca de plano')

        return asStripeOutage(error, 'Não foi possível calcular o valor')
      }
    },
  )

  app.post(
    '/organizations/:organizationId/plan',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'Move the organization to another plan',
        security: [{ BearerAuth: [] }],
        operationId: 'changeOrganizationPlan',
        params: z.object({ organizationId: z.string() }),
        body: z.object({ code: planCode, interval: planInterval }),
        response: {
          200: z.object({
            data: z.object({
              code: planCode,
              interval: planInterval,
              maxMembers: z.number(),
              subscriptionUpdated: z.boolean(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)

      assertSameOrganization(tenant, request.params.organizationId)
      assertManageMembers(tenant)

      const { code, interval } = request.body

      try {
        const result = await changePlan(
          tenant.organizationId,
          code as PlanCode,
          interval as PlanInterval,
        )

        return reply.status(200).send({
          data: {
            code: result.plan.code,
            interval: result.interval,
            maxMembers: result.plan.maxMembers,
            subscriptionUpdated: result.subscriptionUpdated,
          },
        })
      } catch (error) {
        request.log.error({ err: error }, 'falha ao trocar de plano')

        return asStripeOutage(error, 'Não foi possível mudar de plano')
      }
    },
  )
}
