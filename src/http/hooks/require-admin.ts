import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from 'prisma/prisma'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'

const ADMIN_CACHE_TTL_MS = 60_000
const adminCache = new Map<string, { isAdmin: boolean; expiresAt: number }>()

export async function requireAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.user) {
    throw new UnauthorizedException()
  }

  const userId = request.user.sub

  // Fast path: check JWT claim
  if (request.user.isAdmin === true) {
    return
  }

  // Slow path: DB lookup with short-lived cache
  const cached = adminCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.isAdmin) throw new ForbiddenException()
    return
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })

  const isAdmin = user?.isAdmin === true
  adminCache.set(userId, {
    isAdmin,
    expiresAt: Date.now() + ADMIN_CACHE_TTL_MS,
  })

  if (!isAdmin) throw new ForbiddenException()
}
