import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { env } from '@/env'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'
import { stripe } from '@/lib/stripe'
import {
  extraMemberPrice,
  PLAN_CODES,
  PLAN_INTERVALS,
  planByCode,
} from '@/services/billing/list-plans'
import {
  assertPlanFitsMembers,
  countOccupiedSeats,
} from '@/services/billing/plan-access'
import { couponForCheckout } from '@/services/referral/tier-engine'

export const createCheckout: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/billing/checkout',
    {
      preHandler: [auth],
      schema: {
        tags: ['Billing'],
        summary: 'Create checkout session',
        security: [{ BearerAuth: [] }],
        operationId: 'createCheckout',
        body: z.object({
          code: z.enum(PLAN_CODES),
          interval: z.enum(PLAN_INTERVALS),
        }),
        response: {
          200: z.object({ url: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { code, interval } = request.body
      const userId = request.user.sub
      const organizationId = request.tenant.organizationId

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mail: true, name: true },
      })

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { stripeCustomerId: true },
      })

      if (!user || !organization) {
        throw new UnauthorizedException('Usuário não encontrado')
      }

      let customerId = organization.stripeCustomerId

      if (!customerId) {
        const existing = await stripe.customers.list({
          email: user.mail,
          limit: 1,
        })

        if (existing.data.length > 0) {
          customerId = existing.data[0].id
        } else {
          const customer = await stripe.customers.create({
            email: user.mail,
            name: user.name,
          })
          customerId = customer.id
        }

        await prisma.organization.update({
          where: { id: organizationId },
          data: { stripeCustomerId: customerId },
        })
      }

      // O plano precisa comportar quem já está dentro: contratar um teto menor
      // que o escritório atual venderia uma cobrança que a primeira invalidação
      // de convite desmentiria.
      const plan = await planByCode(code)

      if (!plan) {
        throw new ConflictException('Plano indisponível no momento')
      }

      const price = plan[interval]

      if (!price) {
        throw new ConflictException(
          `O plano ${plan.name} não tem cobrança ${
            interval === 'yearly' ? 'anual' : 'mensal'
          }`,
        )
      }

      await assertPlanFitsMembers(organizationId, plan)

      // Escritório que já passou do teto contrata o plano **e** o excedente na
      // mesma sessão: cobrar só o plano entregaria as pessoas a mais de graça
      // até a primeira mudança de equipe.
      const { members } = await countOccupiedSeats(organizationId)
      const extras = plan.allowsExtraMembers
        ? Math.max(0, members - plan.maxMembers)
        : 0
      const extraPrice = extras > 0 ? await extraMemberPrice(interval) : null

      // A user can earn a referral tier while still in trial. Attaching the
      // coupon here is what keeps them from paying full price on the very
      // first invoice — after that, the tier engine keeps it in sync.
      const coupon = await couponForCheckout(userId)

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        discounts: coupon ? [{ coupon }] : undefined,
        line_items: [
          // Quantidade 1 e nunca o número de pessoas: o plano cobre o
          // escritório inteiro, e multiplicar pelo time cobraria o plano vezes
          // a equipe.
          { price: price.priceId, quantity: 1 },
          ...(extraPrice
            ? [{ price: extraPrice.priceId, quantity: extras }]
            : []),
        ],
        success_url: `${env.CLIENT_URL}/billing/success`,
        cancel_url: `${env.CLIENT_URL}/billing/cancel`,
      })

      return reply.status(200).send({ url: session.url ?? '' })
    },
  )
}
