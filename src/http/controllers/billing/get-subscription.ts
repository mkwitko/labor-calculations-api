import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'
import { stripe } from '@/lib/stripe'
import { syncSubscriptionFromStripe } from '@/services/billing/sync-subscription'

const subscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
  'none',
])

type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>

type SubscriptionPayload = {
  data: {
    status: SubscriptionStatus
    trialEnd: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean | null
  }
}

function trialResponse(trialEndsAt: Date | null): SubscriptionPayload {
  const inTrial = trialEndsAt != null && trialEndsAt > new Date()

  return {
    data: {
      status: inTrial ? 'trialing' : 'none',
      trialEnd: inTrial && trialEndsAt ? trialEndsAt.toISOString() : null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: null,
    },
  }
}

function parseStatus(status: string): SubscriptionStatus {
  const parsed = subscriptionStatusSchema.safeParse(status)

  return parsed.success ? parsed.data : 'none'
}

export const getSubscription: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/billing/subscription',
    {
      preHandler: [auth],
      schema: {
        tags: ['Billing'],
        summary: 'Get subscription status',
        security: [{ BearerAuth: [] }],
        operationId: 'getSubscription',
        response: {
          200: z.object({
            data: z.object({
              status: subscriptionStatusSchema,
              trialEnd: z.string().nullable(),
              currentPeriodEnd: z.string().nullable(),
              cancelAtPeriodEnd: z.boolean().nullable(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const organizationId = request.tenant.organizationId

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mail: true },
      })

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          trialEndsAt: true,
          stripeCustomerId: true,
          subscription: true,
        },
      })

      if (!user || !organization) {
        throw new UnauthorizedException('Usuário não encontrado')
      }

      // The local mirror is the fast path and the source of truth. It is
      // written by the Stripe webhook, so it is only missing for organizations
      // that subscribed before the mirror existed — those fall through to a
      // live read that also backfills the row.
      if (organization.subscription) {
        return reply.status(200).send({
          data: {
            status: parseStatus(organization.subscription.status),
            trialEnd: organization.subscription.trialEnd?.toISOString() ?? null,
            currentPeriodEnd:
              organization.subscription.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: organization.subscription.cancelAtPeriodEnd,
          },
        })
      }

      let customerId = organization.stripeCustomerId

      if (!customerId) {
        const customers = await stripe.customers.list({
          email: user.mail,
          limit: 1,
        })

        if (customers.data.length === 0) {
          return reply.status(200).send(trialResponse(organization.trialEndsAt))
        }

        customerId = customers.data[0].id

        await prisma.organization.update({
          where: { id: organizationId },
          data: { stripeCustomerId: customerId },
        })
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: 'all',
        expand: ['data.items'],
      })

      const sub = subscriptions.data[0]

      if (!sub) {
        return reply.status(200).send(trialResponse(organization.trialEndsAt))
      }

      await syncSubscriptionFromStripe(sub)

      const item = sub.items.data[0]

      return reply.status(200).send({
        data: {
          status: parseStatus(sub.status),
          trialEnd: sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
          currentPeriodEnd: item?.current_period_end
            ? new Date(item.current_period_end * 1000).toISOString()
            : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      })
    },
  )
}
