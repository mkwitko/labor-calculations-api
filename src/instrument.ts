import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'
import { env } from '@/env'

// Sentry must be initialized before any instrumented module (Fastify, Prisma,
// http) is imported, so this file is imported FIRST in server.ts — before
// `@/app`. Keep it side-effect only.
if (env.ENV === 'production' && env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.ENV,
    integrations: [nodeProfilingIntegration()],
    // Performance tracing — sample down if volume/quota becomes an issue.
    tracesSampleRate: 0.2,
    // Profiling is relative to traced transactions (0.2 * 1.0 = 20% profiled).
    profilesSampleRate: 1.0,
  })
}
