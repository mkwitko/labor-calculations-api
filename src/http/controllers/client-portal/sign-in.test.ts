import { hash } from 'argon2'
import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

// Este é o teste que faltava: sem ele, os quatro arquivos que consultam
// Client/LaborCalculation antes de haver contexto de tenant podiam quebrar
// silenciosamente e nenhuma suíte percebia, porque nada exercitava o
// caminho de login de ponta a ponta.
//
// As recusas (senha errada, bloqueio) ficam em
// `services/client-portal/authenticate-client.test.ts`: esta rota aceita 10
// requisições por 5 minutos, e o limite vale também em ENV=test.
describe('signInClient', () => {
  const PASSWORD = 'Senha123'

  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  async function clientWith(password: string) {
    const { user, organization } = await createTestUser()

    const client = await systemPrisma.client.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Cliente Portal',
        mail: 'cliente@example.com',
        password,
      },
    })

    return { client, organization }
  }

  function signIn(payload: Record<string, string>) {
    return app.inject({
      method: 'POST',
      url: '/client-portal/sessions',
      payload,
    })
  }

  it('autentica um cliente do portal e devolve o cookie de sessão', async () => {
    await clientWith(
      await hash(PASSWORD, { memoryCost: 1024, timeCost: 1, parallelism: 1 }),
    )

    const response = await signIn({
      mail: 'cliente@example.com',
      password: PASSWORD,
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      status: 'signed_in',
      mustChangePassword: true,
      organizations: [],
    })
    expect(response.cookies.map((cookie) => cookie.name)).toContain(
      'clientAccessToken',
    )
  })

  it('pede o escritório e entra na segunda ida quando há mais de um', async () => {
    const shared = await hash(PASSWORD, {
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
    })
    await clientWith(shared)
    const chosen = await clientWith(shared)

    const first = await signIn({
      mail: 'cliente@example.com',
      password: PASSWORD,
    })

    expect(first.statusCode).toBe(201)
    expect(first.json().status).toBe('choose_organization')
    expect(first.json().organizations).toHaveLength(2)
    expect(first.cookies.map((cookie) => cookie.name)).not.toContain(
      'clientAccessToken',
    )

    const second = await signIn({
      mail: 'cliente@example.com',
      password: PASSWORD,
      organizationId: chosen.organization.id,
    })

    expect(second.json().status).toBe('signed_in')
    expect(second.cookies.map((cookie) => cookie.name)).toContain(
      'clientAccessToken',
    )
  })

  it('assina os irmãos no cookie da segunda ida', async () => {
    const shared = await hash(PASSWORD, {
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
    })
    const first = await clientWith(shared)
    const chosen = await clientWith(shared)

    const response = await signIn({
      mail: 'cliente@example.com',
      password: PASSWORD,
      organizationId: chosen.organization.id,
    })

    expect(response.statusCode).toBe(201)

    const cookie = response.cookies.find(
      (item) => item.name === 'clientAccessToken',
    )
    const payload = app.jwt.verify<{ sub: string; linked?: string[] }>(
      cookie?.value ?? '',
    )

    expect(payload.sub).toBe(chosen.client.id)
    expect(payload.linked).toEqual([first.client.id])
  })
})
