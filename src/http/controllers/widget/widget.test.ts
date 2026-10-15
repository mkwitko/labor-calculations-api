import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import type { PublicAnswers } from '@/services/public-calculation/answers-to-input'
import { createPublicCalculation } from '@/services/public-calculation/public-calculation-service'
import { hashInviteToken } from '@/services/tenant/invite-token'
import { issueWidgetKey } from '@/services/widget/widget-key'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

function authToken(userId: string): string {
  return app.jwt.sign({ sub: userId })
}

const answers: PublicAnswers = {
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
}

describe('chave do widget', () => {
  it('liga, mostra, rotaciona e desliga', async () => {
    const { user, organization } = await createTestUser()
    const headers = { authorization: `Bearer ${authToken(user.id)}` }
    const url = `/organizations/${organization.id}/widget-key`

    expect((await app.inject({ method: 'GET', url, headers })).json()).toEqual({
      widgetKey: null,
    })

    const first = (await app.inject({ method: 'POST', url, headers })).json()
      .widgetKey as string
    expect(first).toBeTruthy()

    expect((await app.inject({ method: 'GET', url, headers })).json()).toEqual({
      widgetKey: first,
    })

    const second = (await app.inject({ method: 'POST', url, headers })).json()
      .widgetKey as string
    expect(second).not.toBe(first)

    await app.inject({ method: 'DELETE', url, headers })
    expect((await app.inject({ method: 'GET', url, headers })).json()).toEqual({
      widgetKey: null,
    })
  })

  it('não entrega a chave de outra organização', async () => {
    const { user } = await createTestUser()
    const other = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: `/organizations/${other.organization.id}/widget-key`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    // 404, nunca 403: um 403 confirmaria que aquela organização existe.
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /public/widget/:key', () => {
  it('devolve a marca do escritório sem autenticação', async () => {
    const { organization } = await createTestUser()
    const key = await issueWidgetKey(organization.id)

    const res = await app.inject({
      method: 'GET',
      url: `/public/widget/${key}`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ officeName: organization.name })
  })

  it('responde 404 para chave desconhecida', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/public/widget/chave-inexistente-mas-longa',
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /public/calculations com chave de widget', () => {
  it('atribui o cálculo à organização dona da chave', async () => {
    const { organization } = await createTestUser()
    const widgetKey = await issueWidgetKey(organization.id)

    const res = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: {
        ...answers,
        source: 'widget',
        widgetKey,
        hostSite: 'advocacia.exemplo.br',
      },
    })

    expect(res.statusCode).toBe(201)

    const row = await systemPrisma.publicCalculation.findFirstOrThrow({
      where: { widgetOrganizationId: organization.id },
    })
    // Dentro do iframe o Referer é o nosso host: o que identifica o site do
    // escritório é o que o loader informou.
    expect(row.referrerHost).toBe('advocacia.exemplo.br')
  })

  it('recusa chave inválida em vez de gravar o cálculo como anônimo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/public/calculations',
      payload: { ...answers, source: 'widget', widgetKey: 'chave-invalida-01' },
    })

    expect(res.statusCode).toBe(404)
    expect(await systemPrisma.publicCalculation.count()).toBe(0)
  })
})

describe('fila do widget', () => {
  /**
   * Pelo serviço, e não por HTTP: o limite de 10 cálculos por hora vale também
   * em `ENV=test`, e este bloco cria vários. O caminho HTTP de criação está
   * coberto acima.
   */
  async function widgetCalculation(organizationId: string, email?: string) {
    const { token } = await createPublicCalculation({
      answers,
      source: 'widget',
      widgetOrganizationId: organizationId,
    })

    const row = await systemPrisma.publicCalculation.update({
      where: { tokenHash: hashInviteToken(token) },
      data: { name: 'Visitante', email },
      select: { id: true },
    })

    return row.id
  }

  it('lista os cálculos do próprio widget', async () => {
    const { user, organization } = await createTestUser()
    const other = await createTestUser()

    const mine = await widgetCalculation(organization.id)
    await widgetCalculation(other.organization.id)

    const res = await app.inject({
      method: 'GET',
      url: '/widget/calculations',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().map((row: { id: string }) => row.id)).toEqual([mine])
  })

  it('importa por id, cria cliente e marca a linha', async () => {
    const { user, organization } = await createTestUser()
    const id = await widgetCalculation(organization.id, 'visitante@example.com')

    const res = await app.inject({
      method: 'POST',
      url: `/widget/calculations/${id}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(201)
    const { clientId, created } = res.json()
    expect(created).toBe(true)

    const client = await systemPrisma.client.findUniqueOrThrow({
      where: { id: clientId },
    })
    expect(client.mail).toBe('visitante@example.com')
    expect(client.organizationId).toBe(organization.id)

    const row = await systemPrisma.publicCalculation.findUniqueOrThrow({
      where: { id },
    })
    expect(row.claimedByOrganizationId).toBe(organization.id)
  })

  // A autorização é ser dono do widget que gerou o cálculo. Sem isso, um id
  // vazado deixaria qualquer escritório importar o visitante de outro.
  it('não importa cálculo do widget de outro escritório', async () => {
    const { user } = await createTestUser()
    const other = await createTestUser()
    const id = await widgetCalculation(other.organization.id)

    const res = await app.inject({
      method: 'POST',
      url: `/widget/calculations/${id}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(404)
  })

  it('não importa cálculo que não veio de widget nenhum', async () => {
    const { user } = await createTestUser()
    const { token } = await createPublicCalculation({ answers, source: 'site' })
    const row = await systemPrisma.publicCalculation.findUniqueOrThrow({
      where: { tokenHash: hashInviteToken(token) },
      select: { id: true },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/widget/calculations/${row.id}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(404)
  })
})
