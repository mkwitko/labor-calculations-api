import { createHash } from 'node:crypto'
import { prisma } from 'prisma/prisma'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function storeRefreshToken(
  userId: string,
  token: string,
  family: string,
  expiresAt: Date,
): Promise<void> {
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      family,
      expiresAt,
    },
  })
}

export async function rotateRefreshToken(
  userId: string,
  oldToken: string,
  newToken: string,
  newExpiresAt: Date,
): Promise<{ valid: boolean; compromised: boolean }> {
  const oldHash = hashToken(oldToken)

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: oldHash },
  })

  if (!stored) {
    return { valid: false, compromised: false }
  }

  if (stored.isRevoked) {
    await revokeFamily(stored.family)
    return { valid: false, compromised: true }
  }

  if (stored.expiresAt < new Date()) {
    return { valid: false, compromised: false }
  }

  if (stored.userId !== userId) {
    return { valid: false, compromised: false }
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { isRevoked: true },
  })

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(newToken),
      family: stored.family,
      expiresAt: newExpiresAt,
    },
  })

  return { valid: true, compromised: false }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId },
    data: { isRevoked: true },
  })
}

async function revokeFamily(family: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { family },
    data: { isRevoked: true },
  })
}

export function generateFamily(): string {
  return createHash('sha256')
    .update(`${Date.now()}-${Math.random()}`)
    .digest('hex')
    .slice(0, 32)
}
