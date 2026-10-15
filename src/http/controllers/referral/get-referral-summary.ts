import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { env } from '@/env'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { ensureReferralCode } from '@/services/referral/attribution'
import { nextTier, resolveTier } from '@/services/referral/tiers'

const referralStatusSchema = z.enum([
  'pending',
  'signed_up',
  'qualified',
  'lost',
])

export const getReferralSummary: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/referral/me',
    {
      preHandler: [auth],
      schema: {
        tags: ['Referral'],
        summary: 'Get referral program summary',
        security: [{ BearerAuth: [] }],
        operationId: 'getReferralSummary',
        response: {
          200: z.object({
            data: z.object({
              code: z.string(),
              link: z.string(),
              qualifiedCount: z.number(),
              tier: z.object({
                key: z.string(),
                label: z.string(),
                percentOff: z.number(),
              }),
              nextTier: z
                .object({
                  label: z.string(),
                  percentOff: z.number(),
                  missing: z.number(),
                })
                .nullable(),
              referrals: z.array(
                z.object({
                  id: z.string(),
                  name: z.string().nullable(),
                  email: z.string().nullable(),
                  status: referralStatusSchema,
                  invitedAt: z.string(),
                  signedUpAt: z.string().nullable(),
                  qualifiedAt: z.string().nullable(),
                }),
              ),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      })

      if (!user) {
        throw new ResourceNotFoundException('Usuário não encontrado')
      }

      const code = await ensureReferralCode(userId)

      const referrals = await prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          inviteEmail: true,
          createdAt: true,
          signedUpAt: true,
          qualifiedAt: true,
          referee: { select: { name: true, mail: true } },
        },
      })

      const qualifiedCount = referrals.filter(
        (r) => r.status === 'qualified',
      ).length

      const tier = resolveTier(qualifiedCount)
      const next = nextTier(qualifiedCount)

      return reply.status(200).send({
        data: {
          code,
          link: `${env.CLIENT_URL}/r/${code}`,
          qualifiedCount,
          tier: {
            key: tier.tier,
            label: tier.label,
            percentOff: tier.percentOff,
          },
          nextTier: next
            ? {
                label: next.tier.label,
                percentOff: next.tier.percentOff,
                missing: next.missing,
              }
            : null,
          referrals: referrals.map((r) => ({
            id: r.id,
            name: r.referee?.name ?? null,
            email: r.referee?.mail ?? r.inviteEmail,
            status: r.status,
            invitedAt: r.createdAt.toISOString(),
            signedUpAt: r.signedUpAt?.toISOString() ?? null,
            qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
          })),
        },
      })
    },
  )
}
