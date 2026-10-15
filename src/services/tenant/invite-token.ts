import { createHash, randomBytes } from 'node:crypto'
import { env } from '@/env'
import { MS_PER_DAY } from '@/utils/constants'

export const INVITE_TTL_MS = 7 * MS_PER_DAY

/**
 * 32 bytes de entropia. O token cru existe em dois lugares só: no e-mail do
 * convidado e na resposta da criação — nunca no banco.
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Mesmo esquema do refresh token (`refresh-token-service.ts`): sha256 hex, sem
 * salt. O token tem 256 bits de entropia, então não há dicionário a resistir; o
 * hash existe para que um dump da tabela não vire credencial de escritório.
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function inviteExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_MS)
}

export function buildInviteUrl(token: string): string {
  return `${env.CLIENT_URL}/convite/${token}`
}
