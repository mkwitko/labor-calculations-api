import type { FastifyReply, FastifyRequest } from 'fastify'
import { systemPrisma } from 'prisma/prisma'
import type { FastifyJWTPayload } from '@/@types/fastify-jwt'
import { setActiveOrganization } from '@/lib/tenant-context'
import { UnauthorizedException } from '../exceptions/unauthorized-exception'

const CLIENT_ACCESS_TOKEN_EXPIRY = '24h'
const CLIENT_ACCESS_MAX_AGE_MS = 24 * 60 * 60 * 1000

export { CLIENT_ACCESS_MAX_AGE_MS, CLIENT_ACCESS_TOKEN_EXPIRY }

/**
 * Client authentication middleware
 * Verifies clientAccessToken cookie and ensures user is a client
 */
export async function clientAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  try {
    const clientAccessToken = request.cookies.clientAccessToken

    if (!clientAccessToken) {
      throw new UnauthorizedException('Cliente não autenticado')
    }

    const decoded =
      request.server.jwt.verify<FastifyJWTPayload>(clientAccessToken)

    // Verify it's a client token
    if (decoded.type !== 'client') {
      throw new UnauthorizedException('Token inválido')
    }

    // Check if client exists and is not deleted
    // Uses systemPrisma: this lookup runs before any tenant context exists,
    // and Client is a tenant model, so the scoped client would throw first.
    const client = await systemPrisma.client.findFirst({
      where: {
        id: decoded.sub,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        mustChangePassword: true,
        loginAttempts: true,
        lockedUntil: true,
      },
    })

    if (!client) {
      throw new UnauthorizedException('Cliente não encontrado')
    }

    // Check if account is locked
    if (client.lockedUntil && client.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (client.lockedUntil.getTime() - Date.now()) / 60000,
      )
      throw new UnauthorizedException(
        `Conta bloqueada. Tente novamente em ${minutesLeft} minutos.`,
      )
    }

    // The portal client acts inside the organization that owns their record.
    setActiveOrganization(client.organizationId)

    // Attach client info to request
    request.user = {
      sub: client.id,
      type: 'client',
      userId: client.userId,
      mustChangePassword: client.mustChangePassword,
      // Vem do token assinado, nunca do corpo: é a autorização para assumir
      // outra conta do mesmo e-mail.
      linked: decoded.linked ?? [],
    }
  } catch (err) {
    if (err instanceof UnauthorizedException) {
      throw err
    }
    throw new UnauthorizedException('Token inválido ou expirado')
  }
}

/**
 * Optional client auth - doesn't throw if not authenticated
 * Useful for public endpoints that want to know if user is logged in
 */
export async function optionalClientAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await clientAuth(request, reply)
  } catch {
    // Silently fail - endpoint can check if request.user exists
  }
}
