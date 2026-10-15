import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '@/app'

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await systemPrisma.$disconnect()
})

/**
 * O corpo do stream não é exercitado por `app.inject`: depois do `hijack()` a
 * resposta nunca termina, e o inject ficaria pendurado. O que dá para afirmar
 * aqui é que a rota existe e que a autenticação vem antes de qualquer byte —
 * que é justamente o que separa um stream de uma porta aberta.
 */
describe('SSE de eventos do caso', () => {
  it('exige sessão do advogado', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/cases/qualquer/events/stream',
    })

    expect(response.statusCode).toBe(401)
  })

  it('exige sessão do cliente no portal', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/client-portal/cases/qualquer/events/stream',
    })

    expect(response.statusCode).toBe(401)
  })
})
