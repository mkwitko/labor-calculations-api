import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { issueApiKey } from '@/services/api/api-key-service'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

const INPUT = {
  clientName: 'Fulano de Tal',
  terminationType: 'sem_justa_causa',
  startDate: '2020-01-10',
  endDate: '2024-03-15',
  lastSalary: 3000,
  baseSalary: 3000,
  unpaid13ths: 0,
  vacationCount: 1,
  priorNoticeWorked: false,
  extraHours: 0,
  nightHours: 0,
  insalubrityLevel: 0,
  dangerousWork: false,
  lastThreeSalariesAvg: 3000,
}

describe('/v1/calculations', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  async function scenario() {
    const { user, organization } = await createTestUser()
    const issued = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'ERP',
    })
    return { user, organization, token: issued.token }
  }

  it('cria o cálculo e devolve procedência', async () => {
    const { token, user } = await scenario()

    const response = await app.inject({
      method: 'POST',
      url: '/v1/calculations/liquidacao',
      headers: { authorization: `Bearer ${token}` },
      payload: INPUT,
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.engineVersion).toBeTruthy()
    expect(body.indexSnapshotHash).toBeTruthy()
    expect(body.verbas.length).toBeGreaterThan(0)

    const saved = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id: body.id },
    })
    // A chamada não tem pessoa: o cálculo fica sob quem emitiu a chave.
    expect(saved.userId).toBe(user.id)
  })

  it('relê o próprio cálculo', async () => {
    const { token } = await scenario()

    const created = await app.inject({
      method: 'POST',
      url: '/v1/calculations/liquidacao',
      headers: { authorization: `Bearer ${token}` },
      payload: INPUT,
    })

    const response = await app.inject({
      method: 'GET',
      url: `/v1/calculations/${created.json().id}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().id).toBe(created.json().id)
  })

  it('não enxerga cálculo de outra organização', async () => {
    const first = await scenario()
    const created = await app.inject({
      method: 'POST',
      url: '/v1/calculations/liquidacao',
      headers: { authorization: `Bearer ${first.token}` },
      payload: INPUT,
    })

    const second = await scenario()
    const response = await app.inject({
      method: 'GET',
      url: `/v1/calculations/${created.json().id}`,
      headers: { authorization: `Bearer ${second.token}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('recusa corpo inválido', async () => {
    const { token } = await scenario()

    const response = await app.inject({
      method: 'POST',
      url: '/v1/calculations/liquidacao',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientName: 'Só o nome' },
    })

    expect(response.statusCode).toBe(400)
  })
})

describe('cobrança das chamadas de /v1', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  async function scenario() {
    const { user, organization } = await createTestUser()
    const issued = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'ERP',
    })
    return { user, organization, token: issued.token }
  }

  it('cobra o cálculo que deu certo', async () => {
    const { token } = await scenario()

    await app.inject({
      method: 'POST',
      url: '/v1/calculations/liquidacao',
      headers: { authorization: `Bearer ${token}` },
      payload: INPUT,
    })

    const usage = await systemPrisma.apiUsage.findMany()
    expect(usage).toHaveLength(1)
    expect(usage[0].endpoint).toBe('POST /v1/calculations/liquidacao')
    expect(usage[0].reportedAt).toBeNull()
  })

  it('não cobra corpo inválido nem leitura', async () => {
    const { token } = await scenario()

    await app.inject({
      method: 'POST',
      url: '/v1/calculations/liquidacao',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientName: 'Só o nome' },
    })
    await app.inject({
      method: 'GET',
      url: '/v1/calculations/qualquer',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(await systemPrisma.apiUsage.count()).toBe(0)
  })

  it('chave de teste calcula e não gera cobrança', async () => {
    const { user, organization } = await createTestUser()
    const issued = await issueApiKey({
      organizationId: organization.id,
      createdById: user.id,
      name: 'Integração',
      mode: 'test',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/calculations/liquidacao',
      headers: { authorization: `Bearer ${issued.token}` },
      payload: INPUT,
    })

    expect(response.statusCode).toBe(201)

    // O integrador escreve a integração sem pagar por tentativa.
    expect(
      await systemPrisma.apiUsage.count({
        where: { organizationId: organization.id },
      }),
    ).toBe(0)
  })
})
