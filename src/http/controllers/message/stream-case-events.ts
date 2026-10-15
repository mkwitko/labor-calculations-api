import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { subscribe } from '@/services/messaging/broker'
import { assertCaseVisible } from '@/services/tenant/case-access'

const HEARTBEAT_MS = 25_000

export const streamCaseEvents: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/events/stream',
    {
      preHandler: [auth],
      // Cada reconexão do EventSource conta no limite global do `app.ts`. Uma
      // queda de rede viraria 429 em cadeia.
      config: { rateLimit: false },
      schema: {
        tags: ['Message'],
        summary: 'Stream case events (SSE)',
        operationId: 'streamCaseEvents',
        params: z.object({ caseId: z.string() }),
        // A resposta é um stream: documentar sem schema evita que o type
        // provider tente serializá-la.
        response: { 200: z.any() },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      await assertCaseVisible(request.tenant, caseId)

      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      const unsubscribe = subscribe(
        {
          organizationId: request.tenant.organizationId,
          caseId,
          viewer: 'lawyer',
        },
        (event) => {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
        },
      )

      const heartbeat = setInterval(() => {
        reply.raw.write(':ping\n\n')
      }, HEARTBEAT_MS)

      request.raw.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
        reply.raw.end()
      })
    },
  )
}
