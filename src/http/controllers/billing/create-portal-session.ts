import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { env } from '@/env'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'
import { stripe } from '@/lib/stripe'

export const createPortalSession: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/billing/portal',
    {
      preHandler: [auth],
      schema: {
        tags: ['Billing'],
        summary: 'Create customer portal session',
        security: [{ BearerAuth: [] }],
        operationId: 'createPortalSession',
        response: {
          200: z.object({ url: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const organizationId = request.tenant.organizationId

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mail: true },
      })

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { stripeCustomerId: true },
      })

      if (!user || !organization) {
        throw new UnauthorizedException('Usuário não encontrado')
      }

      let customerId = organization.stripeCustomerId

      if (!customerId) {
        const customers = await stripe.customers.list({
          email: user.mail,
          limit: 1,
        })

        if (customers.data.length === 0) {
          throw new UnauthorizedException('Cliente não encontrado no Stripe')
        }
        customerId = customers.data[0].id

        await prisma.organization.update({
          where: { id: organizationId },
          data: { stripeCustomerId: customerId },
        })
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${env.CLIENT_URL}/billing`,
      })

      return reply.status(200).send({ url: session.url })
    },
  )
}
