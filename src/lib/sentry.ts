import * as Sentry from '@sentry/node'
import { env } from '@/env'

// The SDK is initialized in `@/instrument` (imported first in server.ts) so
// Fastify/Prisma/http auto-instrumentation is wired up before those modules
// load. This module only exposes helpers used across the app.
const enabled = env.ENV === 'production' && !!env.SENTRY_DSN

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (!enabled) return
  Sentry.captureException(error, { extra: context })
}
