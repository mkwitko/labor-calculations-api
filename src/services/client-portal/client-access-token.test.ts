import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import {
  consumeClientAccessToken,
  issueClientAccessToken,
  resolveClientAccessToken,
} from './client-access-token'

describe('clientAccessToken', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  async function client() {
    const { user, organization } = await createTestUser()

    const row = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
      },
    })

    return { clientId: row.id, organizationId: organization.id }
  }

  it('stores only the hash, never the raw token', async () => {
    const { clientId, organizationId } = await client()

    const { token } = await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'reset',
    })

    const stored = await systemPrisma.clientAccessToken.findFirst({
      where: { clientId },
      select: { tokenHash: true },
    })

    expect(stored?.tokenHash).not.toBe(token)
    expect(stored?.tokenHash).toHaveLength(64)
  })

  it('resolves a fresh token without consuming it', async () => {
    const { clientId, organizationId } = await client()

    const { token } = await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'invite',
    })

    expect(await resolveClientAccessToken(token, 'invite')).toMatchObject({
      clientId,
      organizationId,
    })
    expect(await resolveClientAccessToken(token, 'invite')).not.toBeNull()
  })

  it('refuses a token asked for under a different purpose', async () => {
    const { clientId, organizationId } = await client()

    const { token } = await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'invite',
    })

    expect(await resolveClientAccessToken(token, 'reset')).toBeNull()
  })

  it('refuses an expired token', async () => {
    const { clientId, organizationId } = await client()

    const { token } = await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'reset',
    })

    await systemPrisma.clientAccessToken.updateMany({
      where: { clientId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    expect(await resolveClientAccessToken(token, 'reset')).toBeNull()
  })

  it('refuses an unknown token', async () => {
    expect(await resolveClientAccessToken('nao-existe', 'reset')).toBeNull()
  })

  it('consumes a token exactly once', async () => {
    const { clientId, organizationId } = await client()

    const { token } = await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'reset',
    })

    expect(await consumeClientAccessToken(token, 'reset')).not.toBeNull()
    expect(await consumeClientAccessToken(token, 'reset')).toBeNull()
  })

  it('invalidates the previous token of the same purpose', async () => {
    const { clientId, organizationId } = await client()

    const first = await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'reset',
    })
    const second = await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'reset',
    })

    expect(await resolveClientAccessToken(first.token, 'reset')).toBeNull()
    expect(await resolveClientAccessToken(second.token, 'reset')).not.toBeNull()
  })

  // Convite e redefinição são trilhas independentes: pedir "esqueci a senha"
  // não pode matar o link de primeiro acesso que ainda não foi usado.
  it('leaves a token of the other purpose alone', async () => {
    const { clientId, organizationId } = await client()

    const invite = await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'invite',
    })
    await issueClientAccessToken({
      clientId,
      organizationId,
      purpose: 'reset',
    })

    expect(
      await resolveClientAccessToken(invite.token, 'invite'),
    ).not.toBeNull()
  })
})
