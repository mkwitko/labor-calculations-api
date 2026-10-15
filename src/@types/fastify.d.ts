import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    errorContext: { message: string; code?: string } | null
    capturedRequestBody: string | null
    capturedResponseBody: string | null
    // Set only on the Stripe webhook route — signature verification needs the
    // exact bytes Stripe signed, which JSON.parse would discard.
    rawBody: Buffer | null
  }
}
