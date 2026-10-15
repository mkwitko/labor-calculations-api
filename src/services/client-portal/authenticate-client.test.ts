import { hash } from 'argon2'
import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { authenticateClient } from './authenticate-client'

const PASSWORD = 'Senha123'

async function hashed(password = PASSWORD) {
  return hash(password, { memoryCost: 1024, timeCost: 1, parallelism: 1 })
}

async function clientIn(overrides: { mail?: string; password?: string } = {}) {
  const { user, organization } = await createTestUser()

  const client = await systemPrisma.client.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      name: 'Cliente Portal',
      mail: overrides.mail ?? 'cliente@example.com',
      password: overrides.password ?? (await hashed()),
    },
  })

  return { client, organization }
}

// As recusas ficam aqui, e não no teste do controller, porque o limite por rota
// (10 requisições em 5 minutos) vale também em ENV=test: exercitar o bloqueio
// por HTTP colheria 429 no lugar do que se afere.
describe('authenticateClient', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('entra direto quando o e-mail casa em um escritório só', async () => {
    const { client } = await clientIn()

    const result = await authenticateClient({
      mail: 'cliente@example.com',
      password: PASSWORD,
    })

    expect(result).toMatchObject({
      status: 'signed_in',
      clientId: client.id,
      mustChangePassword: true,
    })
  })

  it('marca o último acesso e zera as tentativas ao entrar', async () => {
    const { client } = await clientIn()

    await systemPrisma.client.update({
      where: { id: client.id },
      data: { loginAttempts: 3 },
    })

    await authenticateClient({
      mail: 'cliente@example.com',
      password: PASSWORD,
    })

    const stored = await systemPrisma.client.findUniqueOrThrow({
      where: { id: client.id },
      select: { loginAttempts: true, lastLoginAt: true },
    })
    expect(stored.loginAttempts).toBe(0)
    expect(stored.lastLoginAt).not.toBeNull()
  })

  it('pede o escritório quando a mesma senha vale em mais de um', async () => {
    const shared = await hashed()
    const first = await clientIn({ password: shared })
    const second = await clientIn({ password: shared })

    const result = await authenticateClient({
      mail: 'cliente@example.com',
      password: PASSWORD,
    })

    expect(result.status).toBe('choose_organization')
    if (result.status !== 'choose_organization') return

    expect(result.organizations.map((org) => org.id).sort()).toEqual(
      [first.organization.id, second.organization.id].sort(),
    )
  })

  it('entra no escritório escolhido na segunda ida', async () => {
    const shared = await hashed()
    await clientIn({ password: shared })
    const chosen = await clientIn({ password: shared })

    const result = await authenticateClient({
      mail: 'cliente@example.com',
      password: PASSWORD,
      organizationId: chosen.organization.id,
    })

    expect(result).toMatchObject({
      status: 'signed_in',
      clientId: chosen.client.id,
    })
  })

  // O escritório certo não aparece só porque outro tem a mesma senha: a lista
  // sai depois da senha bater, e uma senha diferente não entra nela.
  it('não lista o escritório cuja senha não bate', async () => {
    const first = await clientIn()
    await clientIn({ password: await hashed('OutraSenha1') })

    const result = await authenticateClient({
      mail: 'cliente@example.com',
      password: PASSWORD,
    })

    expect(result).toMatchObject({
      status: 'signed_in',
      clientId: first.client.id,
    })
  })

  it('recusa e-mail sem cadastro sem revelar nada', async () => {
    await expect(
      authenticateClient({ mail: 'ninguem@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('recusa cadastro que ainda não escolheu senha', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Sem senha',
        mail: 'cliente@example.com',
      },
    })

    await expect(
      authenticateClient({ mail: 'cliente@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('conta a tentativa errada em todos os cadastros do e-mail', async () => {
    const first = await clientIn()
    const second = await clientIn()

    await expect(
      authenticateClient({ mail: 'cliente@example.com', password: 'errada' }),
    ).rejects.toMatchObject({ statusCode: 400 })

    const stored = await systemPrisma.client.findMany({
      where: { id: { in: [first.client.id, second.client.id] } },
      select: { loginAttempts: true },
    })
    expect(stored.map((row) => row.loginAttempts)).toEqual([1, 1])
  })

  it('bloqueia na quinta tentativa errada', async () => {
    const { client } = await clientIn()

    await systemPrisma.client.update({
      where: { id: client.id },
      data: { loginAttempts: 4 },
    })

    await expect(
      authenticateClient({ mail: 'cliente@example.com', password: 'errada' }),
    ).rejects.toMatchObject({ statusCode: 401 })

    const stored = await systemPrisma.client.findUniqueOrThrow({
      where: { id: client.id },
      select: { lockedUntil: true },
    })
    expect(stored.lockedUntil?.getTime()).toBeGreaterThan(Date.now())
  })

  it('recusa com 401 enquanto o bloqueio dura, mesmo com a senha certa', async () => {
    const { client } = await clientIn()

    await systemPrisma.client.update({
      where: { id: client.id },
      data: { lockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
    })

    await expect(
      authenticateClient({ mail: 'cliente@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('volta a aceitar depois que o bloqueio vence', async () => {
    const { client } = await clientIn()

    await systemPrisma.client.update({
      where: { id: client.id },
      data: {
        loginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000),
      },
    })

    const result = await authenticateClient({
      mail: 'cliente@example.com',
      password: PASSWORD,
    })

    expect(result.status).toBe('signed_in')
  })

  it('devolve os irmãos no signed_in quando a senha vale em mais de um escritório', async () => {
    const shared = await hashed()
    const first = await clientIn({ password: shared })
    const second = await clientIn({ password: shared })

    const result = await authenticateClient({
      mail: 'cliente@example.com',
      password: PASSWORD,
      organizationId: second.organization.id,
    })

    expect(result).toMatchObject({
      status: 'signed_in',
      clientId: second.client.id,
      linkedClientIds: [first.client.id],
    })
  })

  // A senha bate num cadastro, só não no escritório pedido: nenhuma tentativa é
  // contada, e a mensagem é a de senha errada — dizer "existe conta, mas não
  // aí" seria oráculo.
  it('recusa quando a senha bate, mas não no escritório escolhido', async () => {
    await clientIn()
    const alien = await clientIn({ password: await hashed('Outra123') })

    await expect(
      authenticateClient({
        mail: 'cliente@example.com',
        password: PASSWORD,
        organizationId: alien.organization.id,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('entra sem irmãos quando só uma senha bate', async () => {
    const only = await clientIn()
    await clientIn({ password: await hashed('Outra123') })

    const result = await authenticateClient({
      mail: 'cliente@example.com',
      password: PASSWORD,
    })

    expect(result).toMatchObject({
      status: 'signed_in',
      clientId: only.client.id,
      linkedClientIds: [],
    })
  })
})
