import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { cookieOptions } from '@/http/hooks/auth'
import { authenticateClient } from '@/services/client-portal/authenticate-client'

const CLIENT_ACCESS_TOKEN_EXPIRY = '24h'
const CLIENT_ACCESS_MAX_AGE_MS = 24 * 60 * 60 * 1000

export const signInClient: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/sessions',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '5 minute',
        },
      },
      schema: {
        tags: ['ClientPortal'],
        summary: 'Client portal sign in',
        operationId: 'signInClient',
        body: z.object({
          mail: z.string().email(),
          password: z.string().min(1),
          // Só na segunda ida, quando a mesma senha vale em mais de um
          // escritório e a pessoa escolheu qual.
          organizationId: z.string().optional(),
        }),
        // Os dois desfechos moram no mesmo 201, discriminados por `status`, em
        // vez de status HTTP diferentes: o gerador de client do front tipa a
        // resposta a partir de um 2xx só, e duas formas em dois status sairiam
        // com o tipo errado do outro lado.
        response: {
          201: z.object({
            status: z.enum(['signed_in', 'choose_organization']),
            mustChangePassword: z.boolean().nullable(),
            organizations: z.array(
              z.object({ id: z.string(), name: z.string() }),
            ),
          }),
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const result = await authenticateClient(request.body)

      if (result.status === 'choose_organization') {
        return reply.status(201).send({
          status: 'choose_organization',
          mustChangePassword: null,
          organizations: result.organizations,
        })
      }

      const accessToken = app.jwt.sign(
        {
          sub: result.clientId,
          type: 'client',
          linked: result.linkedClientIds,
        },
        { expiresIn: CLIENT_ACCESS_TOKEN_EXPIRY },
      )

      reply.setCookie(
        'clientAccessToken',
        accessToken,
        cookieOptions(CLIENT_ACCESS_MAX_AGE_MS),
      )

      return reply.status(201).send({
        status: 'signed_in',
        mustChangePassword: result.mustChangePassword,
        organizations: [],
      })
    },
  )
}
