import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido por `apiKeyAuth`. Ausente em toda rota que não é `/v1`. */
    apiKey?: {
      id: string
      organizationId: string
      createdById: string
      /** `test` calcula igual e não cobra. */
      mode: 'live' | 'test'
    }
  }
}
