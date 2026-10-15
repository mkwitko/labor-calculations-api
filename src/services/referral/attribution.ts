import { randomInt } from 'node:crypto'
import { prisma } from 'prisma/prisma'

// No 0/O, 1/I/L — codes get read aloud and retyped from WhatsApp messages.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const SUFFIX_LENGTH = 4
const PREFIX_LENGTH = 4
const MAX_ATTEMPTS = 8

function randomSuffix(): string {
  let out = ''

  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }

  return out
}

/**
 * Builds a readable code from the user's first name plus random characters —
 * `MAUR7X2K` rather than an opaque id, because the code is meant to be pasted
 * into messages and recognized by the person receiving it.
 */
export function buildCandidateCode(name: string): string {
  const prefix = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, PREFIX_LENGTH)

  return `${prefix || 'ADV'}${randomSuffix()}`
}

/**
 * Returns the user's referral code, generating one on first use. Codes are
 * perpetual — once issued, a user's code never changes, so links shared in the
 * past keep working.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, referralCode: true },
  })

  if (!user) {
    throw new Error(`Usuário ${userId} não encontrado`)
  }

  if (user.referralCode) return user.referralCode

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = buildCandidateCode(user.name)

    const taken = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    })

    if (taken) continue

    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: candidate },
        select: { referralCode: true },
      })

      return updated.referralCode as string
    } catch {
      // Unique violation from a concurrent signup that grabbed the same code —
      // fall through and try another one.
    }
  }

  throw new Error('Não foi possível gerar um código de indicação único')
}

export type AttachResult =
  | { linked: true; referrerId: string }
  | {
      linked: false
      reason: 'unknown_code' | 'self_referral' | 'already_referred'
    }

/**
 * Links a freshly created user to whoever referred them.
 *
 * Never throws on a bad code: a broken or expired link must not stop someone
 * from signing up. Attribution is first-touch and permanent — `refereeId` is
 * unique, so a user can only ever be referred once.
 */
export async function attachReferral(
  refereeId: string,
  code: string,
  refereeEmail?: string,
): Promise<AttachResult> {
  const referrer = await prisma.user.findUnique({
    where: { referralCode: code.trim().toUpperCase() },
    select: { id: true },
  })

  if (!referrer) return { linked: false, reason: 'unknown_code' }
  if (referrer.id === refereeId)
    return { linked: false, reason: 'self_referral' }

  const existing = await prisma.referral.findUnique({
    where: { refereeId },
    select: { id: true },
  })

  if (existing) return { linked: false, reason: 'already_referred' }

  // If this person was already invited by e-mail by the same referrer, reuse
  // that invitation instead of leaving a dangling `pending` row behind.
  const pendingInvite = refereeEmail
    ? await prisma.referral.findFirst({
        where: {
          referrerId: referrer.id,
          status: 'pending',
          refereeId: null,
          inviteEmail: refereeEmail.toLowerCase(),
        },
        select: { id: true },
      })
    : null

  const signedUpAt = new Date()

  if (pendingInvite) {
    await prisma.referral.update({
      where: { id: pendingInvite.id },
      data: { refereeId, status: 'signed_up', signedUpAt },
    })
  } else {
    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId,
        status: 'signed_up',
        signedUpAt,
      },
    })
  }

  return { linked: true, referrerId: referrer.id }
}
