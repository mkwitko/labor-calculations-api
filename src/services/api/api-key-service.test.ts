import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import {
  issueApiKey,
  listApiKeys,
  resolveApiKey,
  revokeApiKey,
} from './api-key-service'

let ctx: Awaited<ReturnType<typeof seed>>

async function seed() {
  const { user, organization } = await createTestUser()
  return { organizationId: organization.id, userId: user.id }
}

beforeEach(async () => {
  await cleanDatabase()
  ctx = await seed()
})

afterAll(async () => {
  await systemPrisma.$disconnect()
})

async function issue(name = 'ERP do cliente') {
  return issueApiKey({
    organizationId: ctx.organizationId,
    createdById: ctx.userId,
    name,
  })
}

describe('modo da chave', () => {
  it('chave de teste nasce com prefixo próprio', async () => {
    const issued = await issueApiKey({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      name: 'Integração do ERP',
      mode: 'test',
    })

    expect(issued.token.startsWith('jp_test_')).toBe(true)
    expect(issued.mode).toBe('test')
  })

  it('sem modo explícito a chave é de produção', async () => {
    const issued = await issue()

    expect(issued.token.startsWith('jp_live_')).toBe(true)
    expect(issued.mode).toBe('live')
  })

  it('resolve a chave de teste e diz o modo', async () => {
    const issued = await issueApiKey({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      name: 'Integração do ERP',
      mode: 'test',
    })

    const resolved = await resolveApiKey(issued.token)

    // Quem cobra é o controller, e ele decide por este campo.
    expect(resolved.mode).toBe('test')
  })

  it('prefixo desconhecido continua recusado', async () => {
    await expect(resolveApiKey('jp_fake_abc.segredo')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('a listagem mostra o modo de cada chave', async () => {
    await issue('Produção')
    await issueApiKey({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      name: 'Teste',
      mode: 'test',
    })

    const keys = await listApiKeys(ctx.organizationId)

    expect(keys.map((key) => key.mode).sort()).toEqual(['live', 'test'])
  })
})

describe('issueApiKey', () => {
  it('devolve token com prefixo e segredo, e não grava o segredo', async () => {
    const issued = await issue()

    expect(issued.token.startsWith('jp_live_')).toBe(true)
    expect(issued.token).toContain('.')
    expect(issued.prefix).toBe(issued.token.split('.')[0])

    const row = await systemPrisma.apiKey.findUniqueOrThrow({
      where: { id: issued.id },
    })
    const secret = issued.token.split('.')[1]
    expect(row.secretHash).not.toBe(secret)
    expect(row.secretHash.length).toBe(64)
  })

  it('duas chaves da mesma organização não colidem', async () => {
    const first = await issue('um')
    const second = await issue('dois')

    expect(second.prefix).not.toBe(first.prefix)
  })
})

describe('resolveApiKey', () => {
  it('resolve organização e autor pela chave', async () => {
    const issued = await issue()

    await expect(resolveApiKey(issued.token)).resolves.toMatchObject({
      id: issued.id,
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
    })
  })

  it('recusa segredo errado', async () => {
    const issued = await issue()
    const forged = `${issued.prefix}.naoeosegredo`

    await expect(resolveApiKey(forged)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('recusa prefixo inexistente', async () => {
    await expect(
      resolveApiKey('jp_live_0000000000000000.qualquer'),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('recusa token sem formato de chave', async () => {
    await expect(resolveApiKey('Bearer-qualquer-coisa')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('recusa chave revogada', async () => {
    const issued = await issue()
    await revokeApiKey({
      organizationId: ctx.organizationId,
      apiKeyId: issued.id,
    })

    await expect(resolveApiKey(issued.token)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('avança lastUsedAt', async () => {
    const issued = await issue()
    await resolveApiKey(issued.token)

    await new Promise((resolve) => setTimeout(resolve, 50))

    const row = await systemPrisma.apiKey.findUniqueOrThrow({
      where: { id: issued.id },
    })
    expect(row.lastUsedAt).not.toBeNull()
  })
})

describe('listApiKeys', () => {
  it('lista sem devolver hash nem segredo', async () => {
    const issued = await issue()

    const keys = await listApiKeys(ctx.organizationId)

    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({ id: issued.id, prefix: issued.prefix })
    expect(JSON.stringify(keys)).not.toContain('secretHash')
  })
})

describe('revokeApiKey', () => {
  it('não revoga chave de outra organização', async () => {
    const issued = await issue()
    const other = await createTestUser()

    await expect(
      revokeApiKey({
        organizationId: other.organization.id,
        apiKeyId: issued.id,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
