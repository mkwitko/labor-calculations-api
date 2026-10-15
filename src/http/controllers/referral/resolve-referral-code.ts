import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'

/**
 * Public lookup used by the signup screen to show who invited the visitor.
 *
 * Returns only the referrer's name — never their e-mail or id — so a stranger
 * cycling through codes learns nothing beyond a first name.
 */
export const resolveReferralCode: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/referral/resolve/:code',
    {
      config: {
        rateLimit: { max: 30, timeWindow: '5 minute' },
      },
      schema: {
        tags: ['Referral'],
        summary: 'Resolve a referral code',
        operationId: 'resolveReferralCode',
        params: z.object({ code: z.string().min(4).max(16) }),
        response: {
          200: z.object({
            data: z.object({
              valid: z.boolean(),
              referrerName: z.string().nullable(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const code = request.params.code.trim().toUpperCase()

      const referrer = await prisma.user.findUnique({
        where: { referralCode: code },
        select: { name: true, deletedAt: true },
      })

      const valid = referrer != null && referrer.deletedAt == null

      return reply.status(200).send({
        data: {
          valid,
          referrerName: valid ? (referrer?.name ?? null) : null,
        },
      })
    },
  )
}
