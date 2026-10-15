import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { onboardingStatusFor } from '@/services/onboarding/onboarding-status'

// Getting-started checklist state, derived from the real data so it is always
// accurate (no manual flags). A lógica vive no serviço porque o cartão de
// próxima ação e o cron de nudge consomem o mesmo checklist.
export const getOnboardingStatus: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/onboarding/status',
    {
      preHandler: [auth],
      schema: {
        tags: ['User'],
        summary: 'Get onboarding checklist status',
        operationId: 'getOnboardingStatus',
        response: {
          200: z.object({
            profileComplete: z.boolean(),
            hasClient: z.boolean(),
            hasCase: z.boolean(),
            hasCalculation: z.boolean(),
            completedCount: z.number(),
            totalCount: z.number(),
            allDone: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const status = await onboardingStatusFor(
        request.user.sub,
        request.tenant.organizationId,
      )

      // Os campos vão um a um em vez de espalhar `status`: `nextStep` não está
      // no schema de resposta e mandá-lo seria contrato acidental.
      return reply.status(200).send({
        profileComplete: status.profileComplete,
        hasClient: status.hasClient,
        hasCase: status.hasCase,
        hasCalculation: status.hasCalculation,
        completedCount: status.completedCount,
        totalCount: status.totalCount,
        allDone: status.allDone,
      })
    },
  )
}
