import Stripe from 'stripe'
import { env } from '@/env'

type StripeClient = InstanceType<typeof Stripe>

let instance: StripeClient | null = null

function getStripe(): StripeClient {
  if (!instance) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    instance = new Stripe(env.STRIPE_SECRET_KEY, { typescript: true })
  }

  return instance
}

// Lazy proxy: the Stripe client is only constructed on first property access,
// so importing this module never throws when STRIPE_SECRET_KEY is unset (e.g. tests).
export const stripe = new Proxy({} as StripeClient, {
  get(_target, prop) {
    const client = getStripe()
    const value = Reflect.get(client, prop)

    return typeof value === 'function' ? value.bind(client) : value
  },
})
