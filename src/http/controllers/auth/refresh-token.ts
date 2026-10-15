import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { FastifyJWTPayload } from '@/@types/fastify-jwt'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import {
  ACCESS_MAX_AGE_MS,
  ACCESS_TOKEN_EXPIRY,
  cookieOptions,
  REFRESH_MAX_AGE_MS,
  REFRESH_TOKEN_EXPIRY,
} from '@/http/hooks/auth'
import {
  revokeAllUserTokens,
  rotateRefreshToken,
} from '@/services/auth/refresh-token-service'

export const refreshToken: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Refresh token',
        operationId: 'refreshToken',
        description: 'Refresh the access and refresh tokens',
        body: z.object({
          refreshToken: z.string(),
        }),
        response: {
          201: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { refreshToken: incomingRefreshToken } = request.body

      try {
        const decoded = app.jwt.verify<FastifyJWTPayload>(incomingRefreshToken)
        const { sub } = decoded
        const payload = {
          sub: decoded.sub,
          isAdmin: decoded.isAdmin,
          org: decoded.org,
        }

        const newRefreshToken = app.jwt.sign(payload, {
          expiresIn: REFRESH_TOKEN_EXPIRY,
        })

        const newExpiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS)

        const { valid, compromised } = await rotateRefreshToken(
          sub,
          incomingRefreshToken,
          newRefreshToken,
          newExpiresAt,
        )

        if (compromised) {
          await revokeAllUserTokens(sub)
          throw new UnauthorizedException(
            'Token compromise detected. All sessions terminated.',
          )
        }

        if (!valid) {
          throw new UnauthorizedException('Token inválido ou expirado.')
        }

        const accessToken = app.jwt.sign(payload, {
          expiresIn: ACCESS_TOKEN_EXPIRY,
        })

        reply.setCookie(
          'accessToken',
          accessToken,
          cookieOptions(ACCESS_MAX_AGE_MS),
        )
        reply.setCookie(
          'refreshToken',
          newRefreshToken,
          cookieOptions(REFRESH_MAX_AGE_MS),
        )

        return reply.status(201).send({
          accessToken,
          refreshToken: newRefreshToken,
        })
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error
        throw new UnauthorizedException('Token inválido ou expirado.')
      }
    },
  )
}
