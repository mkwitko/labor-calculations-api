import { verify } from 'argon2'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import {
  ACCESS_MAX_AGE_MS,
  ACCESS_TOKEN_EXPIRY,
  cookieOptions,
  REFRESH_MAX_AGE_MS,
  REFRESH_TOKEN_EXPIRY,
} from '@/http/hooks/auth'
import {
  generateFamily,
  storeRefreshToken,
} from '@/services/auth/refresh-token-service'
import { resolveActiveMembership } from '@/services/tenant/resolve-membership'

export const signIn: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/auth/sign-in',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '5 minute',
        },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Sign in',
        operationId: 'signIn',
        description:
          'Sign in to the application informing the mail and password',
        body: z.object({
          mail: z.string(),
          password: z.string(),
        }),
        response: {
          201: z.object({
            accessToken: z.jwt(),
            refreshToken: z.jwt(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { mail, password } = request.body

      const userWithDocument = await prisma.user.findUnique({
        where: {
          mail,
          deletedAt: null,
        },
        select: {
          id: true,
          password: true,
          isAdmin: true,
        },
      })

      if (userWithDocument === null) {
        throw new BadRequestException('Credenciais inválidas')
      }

      const isPasswordValid = await verify(userWithDocument.password, password)

      if (isPasswordValid === false) {
        throw new BadRequestException('Credenciais inválidas')
      }

      // Reuse resolveActiveMembership's "no organization requested" ordering
      // (oldest membership first) instead of a second query with its own
      // rule, or the two would drift apart over time.
      const membership = await resolveActiveMembership(
        userWithDocument.id,
        undefined,
      )

      const tokenPayload = {
        sub: userWithDocument.id,
        isAdmin: userWithDocument.isAdmin,
        org: membership?.organizationId,
      }

      const accessToken = app.jwt.sign(tokenPayload, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      })

      const refreshToken = app.jwt.sign(tokenPayload, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
      })

      const family = generateFamily()
      await storeRefreshToken(
        userWithDocument.id,
        refreshToken,
        family,
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
      })
    },
  )
}
