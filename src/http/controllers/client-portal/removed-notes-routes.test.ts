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
 * A nota do advogado é interna. Enquanto estas rotas existiram, qualquer
 * cliente autenticado no portal lia a estratégia do caso — o `findMany` de
 * `get-case-notes.ts` não filtrava por autor. A conversa com o cliente agora é
 * `Message`; nota volta a ser só do escritório.
 */
describe('rotas de nota do portal', () => {
  it('não existem mais', async () => {
    const get = await app.inject({
      method: 'GET',
      url: '/client-portal/cases/qualquer/notes',
    })
    expect(get.statusCode).toBe(404)

    const post = await app.inject({
      method: 'POST',
      url: '/client-portal/cases/qualquer/notes',
      payload: { body: 'oi' },
    })
    expect(post.statusCode).toBe(404)
  })
})
