import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FastifyJWTPayload } from '@/@types/fastify-jwt'
import { env } from '@/env'
import { setActiveOrganization } from '@/lib/tenant-context'
import {
  revokeAllUserTokens,
  rotateRefreshToken,
} from '@/services/auth/refresh-token-service'
import { resolveActiveMembership } from '@/services/tenant/resolve-membership'
import { MS_PER_DAY, MS_PER_MINUTE } from '@/utils/constants'
import { UnauthorizedException } from '../exceptions/unauthorized-exception'

const ACCESS_TOKEN_EXPIRY = env.ENV === 'development' ? '12h' : '30m'
const REFRESH_TOKEN_EXPIRY = '7d'
const REFRESH_MAX_AGE_MS = 7 * MS_PER_DAY
const ACCESS_MAX_AGE_MS = 30 * MS_PER_MINUTE

function cookieOptions(maxAge: number) {
  return {
    path: '/',
    httpOnly: true,
    secure: env.ENV !== 'development',
    sameSite: env.ENV === 'development' ? ('lax' as const) : ('none' as const),
    maxAge,
  }
}

export {
  ACCESS_MAX_AGE_MS,
  ACCESS_TOKEN_EXPIRY,
  cookieOptions,
  REFRESH_MAX_AGE_MS,
  REFRESH_TOKEN_EXPIRY,
}

export async function auth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const header = request.headers.authorization
    const cookie = request.cookies.accessToken
    if (!header) {
      request.headers.authorization = `Bearer ${cookie}`
    }
    await request.jwtVerify()
  } catch {
    const refreshToken = request.cookies.refreshToken
    if (!refreshToken) {
      throw new UnauthorizedException()
    }
    try {
      const decoded = request.server.jwt.verify<FastifyJWTPayload>(refreshToken)
      const payload = {
        sub: decoded.sub,
        isAdmin: decoded.isAdmin,
        org: decoded.org,
      }

      const newExpiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS)
      const newRefreshToken = request.server.jwt.sign(payload, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
      })

      const { valid, compromised } = await rotateRefreshToken(
        decoded.sub,
        refreshToken,
        newRefreshToken,
        newExpiresAt,
      )

      if (compromised) {
        await revokeAllUserTokens(decoded.sub)
        throw new UnauthorizedException(
          'Token compromise detected. All sessions terminated.',
        )
      }

      if (!valid) {
        throw new UnauthorizedException()
      }

      const newAccessToken = request.server.jwt.sign(payload, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      })

      reply.setCookie(
        'accessToken',
        newAccessToken,
        cookieOptions(ACCESS_MAX_AGE_MS),
      )
      reply.setCookie(
        'refreshToken',
        newRefreshToken,
        cookieOptions(REFRESH_MAX_AGE_MS),
      )

      request.headers.authorization = `Bearer ${newAccessToken}`
      await request.jwtVerify()
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err
      throw new UnauthorizedException()
    }
  }

  const membership = await resolveActiveMembership(
    request.user.sub,
    request.user.org,
  )

  if (!membership) {
    // A organização vem do claim do próprio token, não de parâmetro da rota:
    // não haver membership ativa significa que a sessão envelheceu — a pessoa
    // saiu da organização, foi removida dela, ou a organização acabou. Isso é
    // credencial inválida, não verbo negado, então responde 401 e limpa os
    // cookies. É o 401 que faz o front deslogar; com 403 a pessoa ficava presa
    // numa sessão que não serve para nada, vendo o mesmo erro em cada tela.
    reply.clearCookie('accessToken', cookieOptions(0))
    reply.clearCookie('refreshToken', cookieOptions(0))

    throw new UnauthorizedException(
      'Sua sessão não vale mais para esta organização. Entre novamente.',
    )
  }

  request.tenant = {
    userId: request.user.sub,
    organizationId: membership.organizationId,
    role: membership.role,
  }

  setActiveOrganization(membership.organizationId)
}
