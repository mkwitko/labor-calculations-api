import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import { subscribe } from '@/services/messaging/broker'

const HEARTBEAT_MS = 25_000

export const streamClientCaseEvents: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/cases/:caseId/events/stream',
    {
      preHandler: [clientAuth],
      config: { rateLimit: false },
      schema: {
        tags: ['ClientPortal'],
        summary: 'Stream case events as client (SSE)',
        operationId: 'streamClientCaseEvents',
        security: [{ BearerAuth: [] }],
        params: z.object({ caseId: z.string() }),
        response: { 200: z.any() },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params

      const found = await prisma.case.findFirst({
        where: { id: caseId, clientId: request.user.sub, deletedAt: null },
        select: { id: true },
      })

      if (!found) {
        throw new ResourceNotFoundException('Caso não encontrado')
      }

      // `clientAuth` já chamou `setActiveOrganization`.
      const organizationId = requireOrganizationId()

      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      const unsubscribe = subscribe(
        { organizationId, caseId, viewer: 'client' },
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
