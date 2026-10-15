import { hash } from 'argon2'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import {
  attachReferral,
  ensureReferralCode,
} from '@/services/referral/attribution'
import { createPersonalOrganization } from '@/services/tenant/create-organization'

export const createUser: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/users',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '5 minute',
        },
      },
      schema: {
        tags: ['User'],
        summary: 'Create user',
        operationId: 'createUser',
        body: z.object({
          name: z.string().min(2),
          mail: z.string().email(),
          document: z.string().min(11),
          oabNumber: z.string().min(3),
          phone: z.string().optional(),
          password: z.string().min(8),
          referralCode: z.string().min(4).max(16).optional(),
          officeName: z.string().optional(),
        }),
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const {
        name,
        mail,
        document,
        oabNumber,
        phone,
        password,
        referralCode,
        officeName,
      } = request.body

      const hashedPassword = await hash(password)

      const user = await systemPrisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name,
            mail,
            document,
            oabNumber,
            password: hashedPassword,
          },
        })

        await createPersonalOrganization(tx, {
          userId: created.id,
          name: created.name,
          officeName: officeName ?? null,
          phone: phone ?? null,
        })

        return created
      })

      // Neither the referral link nor the user's own code may break signup —
      // both are follow-up perks, not part of creating the account.
      await ensureReferralCode(user.id).catch((err) => {
        console.error('Referral code generation failed', {
          userId: user.id,
          error: err,
        })
      })

      if (referralCode) {
        await attachReferral(user.id, referralCode, mail).catch((err) => {
          console.error('Referral attribution failed', {
            userId: user.id,
            error: err,
          })
        })
      }

      return reply.status(201).send({ id: user.id })
    },
  )
}
