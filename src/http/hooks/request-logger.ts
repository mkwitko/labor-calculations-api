import type { FastifyReply, FastifyRequest } from 'fastify'
import { axiomEnabled, logToAxiom } from '@/lib/axiom'
import { capSize, sanitizeBody } from '@/lib/crypto'

export const bodyCaptureHooks = {
  async onRequest(request: FastifyRequest) {
    if (request.body && typeof request.body === 'object') {
      request.capturedRequestBody = capSize(
        JSON.stringify(sanitizeBody(request.body)),
      )
    }
  },

  async onSend(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
    // Expose the trace id so it can be correlated with the external log.
    reply.header('x-trace-id', request.id)
    if (typeof payload === 'string') {
      // Sanitize by key (password/token/etc.) before it can be shipped to the
      // external log, mirroring the request-body capture.
      try {
        request.capturedResponseBody = capSize(
          JSON.stringify(sanitizeBody(JSON.parse(payload))),
        )
      } catch {
        request.capturedResponseBody = capSize(payload)
      }
    }
    return payload
  },
}

// Ships a structured entry for every request to the external log platform
// (Axiom). traceId === request.id, also returned in the x-trace-id header.
export async function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!axiomEnabled) return

  const [path, query] = request.url.split('?')
  const userId = (request.user as { sub: string } | undefined)?.sub ?? null

  logToAxiom({
    traceId: request.id,
    sessionId: (request.headers['x-session-id'] as string | undefined) ?? null,
    method: request.method,
    url: request.url,
    path,
    query: query ?? null,
    statusCode: reply.statusCode,
    responseTimeMs: Math.round(reply.elapsedTime),
    userId,
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
    referer: request.headers.referer ?? null,
    errorMessage: request.errorContext?.message ?? null,
    errorCode: request.errorContext?.code ?? null,
    requestBody: request.capturedRequestBody ?? null,
    responseBody: request.capturedResponseBody ?? null,
  })
}
