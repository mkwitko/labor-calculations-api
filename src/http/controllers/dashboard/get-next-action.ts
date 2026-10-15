import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { resolveNextAction } from '@/services/onboarding/next-action'

// A única próxima ação do usuário, para o cartão que nunca desaparece do
// painel. A decisão é do servidor: o front não escolhe entre sugestões.
export const getNextAction: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/dashboard/next-action',
    {
      preHandler: [auth],
      schema: {
        tags: ['Dashboard'],
        summary: 'The single next action for the dashboard card',
        operationId: 'getDashboardNextAction',
        response: {
          200: z.object({
            phase: z.enum(['setup', 'attention', 'resume', 'idle']),
            title: z.string(),
            hint: z.string(),
            to: z.string(),
            progress: z
              .object({ completed: z.number(), total: z.number() })
              .optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const action = await resolveNextAction(request.tenant)

      return reply.status(200).send(action)
    },
  )
}
