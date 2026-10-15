import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'

const body = {
  terminationType: 'sem_justa_causa',
  startDate: '2020-01-10',
  endDate: '2024-06-20',
  lastSalary: 3000,
  registeredContract: true,
  priorNoticeWorked: false,
  unpaid13ths: 1,
  vacationVencidasCount: 1,
  extraHours: 'nao',
  nightWork: 'nao',
  insalubrity: 'nao',
  dangerousWork: 'nao',
  source: 'site',
}

beforeEach(async () => {
  await systemPrisma.publicCalculation.deleteMany()
})

afterAll(async () => {
  await systemPrisma.publicCalculation.deleteMany()
  await app.close()
})

describe('POST /public/calculations', () => {
  it('calcula sem autenticação e devolve token e faixa', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: body,
    })

    expect(response.statusCode).toBe(201)
    const json = response.json()
    expect(typeof json.token).toBe('string')
    expect(json.result.floor).toBeGreaterThan(0)
    expect(json.result.ceiling).toBeGreaterThanOrEqual(json.result.floor)
    expect(Array.isArray(json.result.lines)).toBe(true)
  })

  it('recusa data de saída anterior à de entrada', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: { ...body, startDate: '2024-06-20', endDate: '2020-01-10' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('recusa salário fora de faixa plausível', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: { ...body, lastSalary: 90_000_000 },
    })

    expect(response.statusCode).toBe(400)
  })
})

describe('POST /public/calculations com perspectiva de empresa', () => {
  it('devolve o bloco do empregador e guarda a perspectiva', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: { ...body, perspective: 'empresa', source: 'rh' },
    })

    expect(response.statusCode).toBe(201)
    const { employer } = response.json().result
    expect(employer.severanceCost).toBeGreaterThan(0)
    expect(employer.exposure).toBeGreaterThanOrEqual(employer.severanceCost)
    expect(employer.gap).toBeCloseTo(
      employer.exposure - employer.severanceCost,
      2,
    )

    const row = await systemPrisma.publicCalculation.findFirstOrThrow()
    expect(row.perspective).toBe('empresa')
  })

  it('sem perspectiva, continua sendo do trabalhador e sem bloco de empregador', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: body,
    })

    expect(response.json().result.employer).toBeUndefined()
    const row = await systemPrisma.publicCalculation.findFirstOrThrow()
    expect(row.perspective).toBe('trabalhador')
  })
})

describe('GET /public/calculations/:token', () => {
  it('relê pelo token e não devolve contato', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: body,
    })
    const { token } = created.json()

    const response = await app.inject({
      method: 'GET',
      url: `/public/calculations/${token}`,
    })

    expect(response.statusCode).toBe(200)
    const json = response.json()
    expect(json.result.lines.length).toBeGreaterThan(0)
    expect(json.hasContact).toBe(false)
    expect(json.email).toBeUndefined()
    expect(json.phone).toBeUndefined()
  })

  it('responde 404 para token desconhecido', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/public/calculations/token-que-nao-existe',
    })

    expect(response.statusCode).toBe(404)
  })
})

describe('PATCH /public/calculations/:token/contact', () => {
  it('guarda o contato e passa a sinalizar que já foi dado', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: body,
    })
    const { token } = created.json()

    const patch = await app.inject({
      method: 'PATCH',
      url: `/public/calculations/${token}/contact`,
      payload: { name: 'Maria', email: 'maria@example.com' },
    })

    expect(patch.statusCode).toBe(204)

    const response = await app.inject({
      method: 'GET',
      url: `/public/calculations/${token}`,
    })
    expect(response.json().hasContact).toBe(true)
  })
})
