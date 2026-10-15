import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type {
  StripeCharge,
  StripeEvent,
  StripeInvoice,
  StripeSubscription,
} from '@/@types/stripe'
import { env } from '@/env'
import { stripe } from '@/lib/stripe'
import {
  extractCustomerId,
  findOrganizationByStripeCustomerId,
  markSubscriptionFirstPaid,
  syncSubscriptionFromStripe,
} from '@/services/billing/sync-subscription'
import {
  loseReferralForReferee,
  qualifyReferralForReferee,
} from '@/services/referral/qualify'
import { findOrganizationOwner } from '@/services/tenant/owned-organization'
import { STRIPE_WEBHOOK_PATH } from '@/utils/constants'

/**
 * The subscription id moved out of `Invoice` and into `parent` in recent Stripe
 * API versions. Read both so the handler survives an account on either one.
 */
function subscriptionIdFromInvoice(invoice: StripeInvoice): string | null {
  const parent = invoice.parent as
    | { subscription_details?: { subscription?: string | { id: string } } }
    | null
    | undefined

  const fromParent = parent?.subscription_details?.subscription
  const legacy = (
    invoice as unknown as { subscription?: string | { id: string } }
  ).subscription

  const value = fromParent ?? legacy

  if (!value) return null

  return typeof value === 'string' ? value : value.id
}

async function handleInvoicePaid(invoice: StripeInvoice): Promise<void> {
  const customerId = extractCustomerId(invoice.customer)
  const organization = await findOrganizationByStripeCustomerId(customerId)

  if (!organization) return

  const paidAt = new Date(invoice.created * 1000)

  // Make sure the local mirror exists before anything reads it — an
  // `invoice.paid` can land before `customer.subscription.updated`.
  const subscriptionId = subscriptionIdFromInvoice(invoice)

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items'],
    })

    await syncSubscriptionFromStripe(subscription)
  }

  if (invoice.amount_paid <= 0) return

  await markSubscriptionFirstPaid(organization.id, paidAt)

  const owner = await findOrganizationOwner(organization.id)

  if (!owner) {
    console.error('Referral qualification skipped: no owner membership', {
      event: 'invoice.paid',
      organizationId: organization.id,
    })
    return
  }

  await qualifyReferralForReferee(owner.userId, invoice.amount_paid, paidAt)
}

async function handleSubscriptionDeleted(
  subscription: StripeSubscription,
): Promise<void> {
  await syncSubscriptionFromStripe(subscription)

  const organization = await findOrganizationByStripeCustomerId(
    extractCustomerId(subscription.customer),
  )

  if (!organization) return

  const owner = await findOrganizationOwner(organization.id)

  if (!owner) {
    console.error('Referral loss skipped: no owner membership', {
      event: 'customer.subscription.deleted',
      organizationId: organization.id,
    })
    return
  }

  await loseReferralForReferee(owner.userId, new Date())
}

async function handleChargeRefunded(charge: StripeCharge): Promise<void> {
  const organization = await findOrganizationByStripeCustomerId(
    extractCustomerId(charge.customer),
  )

  if (!organization) return

  const owner = await findOrganizationOwner(organization.id)

  if (!owner) {
    console.error('Referral loss skipped: no owner membership', {
      event: 'charge.refunded',
      organizationId: organization.id,
    })
    return
  }

  await loseReferralForReferee(owner.userId, new Date())
}

export const stripeWebhook: FastifyPluginCallbackZod = (app) => {
  app.post(
    STRIPE_WEBHOOK_PATH,
    {
      // Stripe bursts events and retries failures; the global limit would turn
      // a busy minute into lost events.
      config: { rateLimit: false },
      schema: {
        tags: ['Billing'],
        summary: 'Stripe webhook',
        operationId: 'stripeWebhook',
        response: {
          200: z.object({ received: z.boolean() }),
          400: z.object({ message: z.string() }),
          503: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      if (!env.STRIPE_WEBHOOK_SECRET) {
        return reply
          .status(503)
          .send({ message: 'Webhook do Stripe não configurado' })
      }

      const signature = request.headers['stripe-signature']
      const raw = request.rawBody

      if (typeof signature !== 'string' || !raw) {
        return reply.status(400).send({ message: 'Assinatura ausente' })
      }

      let event: StripeEvent

      try {
        event = stripe.webhooks.constructEvent(
          raw,
          signature,
          env.STRIPE_WEBHOOK_SECRET,
        )
      } catch {
        return reply.status(400).send({ message: 'Assinatura inválida' })
      }

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.paused':
        case 'customer.subscription.resumed':
          await syncSubscriptionFromStripe(event.data.object)
          break

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object)
          break

        case 'invoice.paid':
          await handleInvoicePaid(event.data.object)
          break

        case 'charge.refunded':
          await handleChargeRefunded(event.data.object)
          break

        default:
          break
      }

      return reply.status(200).send({ received: true })
    },
  )
}
