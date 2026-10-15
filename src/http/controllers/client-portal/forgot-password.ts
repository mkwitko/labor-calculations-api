import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import {
  buildClientResetUrl,
  issueClientAccessToken,
} from '@/services/client-portal/client-access-token'
import { sendPasswordResetEmail } from '@/services/email/send-password-reset'

const GENERIC_MESSAGE =
  'Se o email estiver cadastrado, você receberá um link para redefinir sua senha.'

/** Mesmo teto do login: cinco cadastros com o mesmo e-mail já é caso extremo. */
const MAX_CLIENTS = 5

export const forgotPassword: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/forgot-password',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '15 minute',
        },
      },
      schema: {
        tags: ['ClientPortal'],
        summary: 'Request password reset',
        operationId: 'forgotPasswordClient',
        body: z.object({
          mail: z.string().email(),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { mail } = request.body

      // Client é modelo tenant e não há contexto de organização numa rota
      // pública, então a busca usa systemPrisma.
      //
      // A OAB do advogado saiu do corpo junto com o login: quem esqueceu a
      // senha do portal também não sabe o número. Sem ela, o e-mail sozinho
      // pode casar em mais de um escritório, e cada cadastro recebe o seu
      // link — o nome do escritório vai no e-mail para a pessoa saber qual é
      // qual.
      const clients = await systemPrisma.client.findMany({
        where: { mail, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: MAX_CLIENTS,
        select: { id: true, name: true, organizationId: true },
      })

      for (const client of clients) {
        // O token mora em `ClientAccessToken`. Antes era serializado dentro de
        // `Client.notes`, o que apagava as anotações que o advogado tinha sobre
        // a pessoa e deixava a credencial sem expiração auditável.
        const { token } = await issueClientAccessToken({
          clientId: client.id,
          organizationId: client.organizationId,
          purpose: 'reset',
        })

        const organization = await systemPrisma.organization.findUnique({
          where: { id: client.organizationId },
          select: { name: true },
        })

        await sendPasswordResetEmail(
          mail,
          client.name,
          buildClientResetUrl(token),
          organization?.name ?? null,
        ).catch((err) => {
          console.error('Failed to send password reset email', { error: err })
        })
      }

      return reply.status(200).send({ message: GENERIC_MESSAGE })
    },
  )
}
