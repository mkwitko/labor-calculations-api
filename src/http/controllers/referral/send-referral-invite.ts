import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { env } from '@/env'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { sendEmail } from '@/services/email'
import { emailTemplates } from '@/services/email/templates'
import { ensureReferralCode } from '@/services/referral/attribution'

export const sendReferralInvite: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/referral/invite',
    {
      preHandler: [auth],
      config: {
        // Invites leave the platform as e-mail; a low ceiling keeps the
        // program from being used as a mailing list.
        rateLimit: { max: 20, timeWindow: '1 hour' },
      },
      schema: {
        tags: ['Referral'],
        summary: 'Invite a colleague by e-mail',
        security: [{ BearerAuth: [] }],
        operationId: 'sendReferralInvite',
        body: z.object({
          email: z.string().email(),
        }),
        response: {
          201: z.object({ data: z.object({ id: z.string() }) }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const email = request.body.email.toLowerCase()

      const referrer = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, mail: true },
      })

      if (!referrer) {
        throw new ResourceNotFoundException('Usuário não encontrado')
      }

      if (referrer.mail.toLowerCase() === email) {
        throw new ConflictException('Você não pode indicar a si mesmo')
      }

      const alreadyRegistered = await prisma.user.findUnique({
        where: { mail: email },
        select: { id: true },
      })

      if (alreadyRegistered) {
        throw new ConflictException('Esse e-mail já tem conta no LexLaboral')
      }

      const duplicate = await prisma.referral.findFirst({
        where: { referrerId: userId, inviteEmail: email, status: 'pending' },
        select: { id: true },
      })

      if (duplicate) {
        throw new ConflictException('Você já convidou esse e-mail')
      }

      const code = await ensureReferralCode(userId)

      const referral = await prisma.referral.create({
        data: { referrerId: userId, inviteEmail: email, status: 'pending' },
        select: { id: true },
      })

      const template = emailTemplates.referralInvite({
        referrerName: referrer.name,
        inviteUrl: `${env.CLIENT_URL}/r/${code}`,
      })

      await sendEmail({ to: email, ...template })

      return reply.status(201).send({ data: { id: referral.id } })
    },
  )
}
