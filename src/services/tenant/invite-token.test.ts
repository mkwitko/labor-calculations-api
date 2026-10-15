import { describe, expect, it } from 'vitest'
import { MS_PER_DAY } from '@/utils/constants'
import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TTL_MS,
  inviteExpiryFrom,
} from './invite-token'

describe('generateInviteToken', () => {
  it('gera token base64url longo o bastante para ser imprevisível', () => {
    const token = generateInviteToken()

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(40)
  })

  it('não repete', () => {
    const tokens = new Set(
      Array.from({ length: 20 }, () => generateInviteToken()),
    )

    expect(tokens.size).toBe(20)
  })
})

describe('hashInviteToken', () => {
  it('é determinístico e devolve sha256 em hex', () => {
    const hash = hashInviteToken('token-fixo')

    expect(hash).toBe(hashInviteToken('token-fixo'))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('não devolve o próprio token', () => {
    const token = generateInviteToken()

    expect(hashInviteToken(token)).not.toContain(token)
  })
})

describe('inviteExpiryFrom', () => {
  it('soma exatamente sete dias', () => {
    const now = new Date('2026-08-05T12:00:00.000Z')

    expect(inviteExpiryFrom(now).toISOString()).toBe('2026-08-12T12:00:00.000Z')
    expect(INVITE_TTL_MS).toBe(7 * MS_PER_DAY)
  })
})
