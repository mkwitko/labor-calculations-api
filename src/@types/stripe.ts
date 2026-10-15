import type { stripe } from '@/lib/stripe'

// The stripe package keeps its resource types in a namespace that `node16`
// module resolution cannot reach (`export = StripeConstructor` exposes only the
// client). Deriving them from the client's own signatures gives the same types
// without depending on the package's internal file layout.

export type StripeEvent = ReturnType<typeof stripe.webhooks.constructEvent>

export type StripeEventOf<T extends StripeEvent['type']> = Extract<
  StripeEvent,
  { type: T }
>

export type StripeSubscription =
  StripeEventOf<'customer.subscription.updated'>['data']['object']

export type StripeInvoice = StripeEventOf<'invoice.paid'>['data']['object']

export type StripeCharge = StripeEventOf<'charge.refunded'>['data']['object']

/** `string | Customer | DeletedCustomer | null`, as it appears on resources. */
export type StripeCustomerRef = StripeInvoice['customer']
