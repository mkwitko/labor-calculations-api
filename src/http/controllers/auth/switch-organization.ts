import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import {
  ACCESS_MAX_AGE_MS,
  ACCESS_TOKEN_EXPIRY,
  auth,
  cookieOptions,
  REFRESH_MAX_AGE_MS,
  REFRESH_TOKEN_EXPIRY,
} from '@/http/hooks/auth'
import {
  generateFamily,
  storeRefreshToken,
} from '@/services/auth/refresh-token-service'
import { resolveActiveMembership } from '@/services/tenant/resolve-membership'

export const switchOrganization: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/auth/switch-organization',
    {
      preHandler: [auth],
      schema: {
        tags: ['Auth'],
        summary: 'Switch the active organization',
        security: [{ BearerAuth: [] }],
        operationId: 'switchOrganization',
        description:
          'Reissues the access and refresh tokens carrying the requested organization',
        body: z.object({
          organizationId: z.string(),
        }),
        response: {
          201: z.object({
            accessToken: z.jwt(),
            refreshToken: z.jwt(),
            organizationId: z.string(),
            role: z.enum(['owner', 'admin', 'lawyer', 'staff', 'intern']),
          }),
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.body

      // A mesma leitura que `auth` faz a cada request valida a membership e
      // devolve o papel — reusá-la aqui evita uma segunda regra de "membership
      // válida" que divergiria com o tempo.
      const membership = await resolveActiveMembership(
        request.user.sub,
        organizationId,
      )

      if (!membership) {
        throw new ForbiddenException('Você não é membro dessa organização')
      }

      const tokenPayload = {
        sub: request.user.sub,
        isAdmin: request.user.isAdmin,
        org: membership.organizationId,
      }

      const accessToken = app.jwt.sign(tokenPayload, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      })
      const refreshToken = app.jwt.sign(tokenPayload, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
      })

      // Família nova em vez de rotação da atual: o refresh antigo continua
      // valendo para a organização antiga, que é o que se espera de duas abas
      // abertas em escritórios diferentes.
      await storeRefreshToken(
        request.user.sub,
        refreshToken,
        generateFamily(),
        new Date(Date.now() + REFRESH_MAX_AGE_MS),
      )

      reply.setCookie(
        'accessToken',
        accessToken,
        cookieOptions(ACCESS_MAX_AGE_MS),
      )
      reply.setCookie(
        'refreshToken',
        refreshToken,
        cookieOptions(REFRESH_MAX_AGE_MS),
      )

      return reply.status(201).send({
        accessToken,
        refreshToken,
        organizationId: membership.organizationId,
        role: membership.role,
      })
    },
  )
}
