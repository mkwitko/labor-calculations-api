import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import type { PublicAnswers } from '@/services/public-calculation/answers-to-input'
import {
  createPublicCalculation,
  savePublicContact,
} from '@/services/public-calculation/public-calculation-service'
import {
  cleanDatabase,
  createOrganizationWithRoles,
  createTestUser,
} from '@/tests/helpers/db'

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

/**
 * Pelo serviço, e não por HTTP: o limite de 10 cálculos por hora vale também em
 * `ENV=test` (só o limite global é afrouxado em `app.ts`), e este arquivo cria
 * mais de dez. Pelo HTTP, do décimo primeiro em diante viria 429 e o token
 * chegaria indefinido nas asserções. O caminho HTTP de criação está coberto em
 * `public-calculation.test.ts`.
 */
async function publicCalculation(contact?: { name?: string; email?: string }) {
  const { token, result } = await createPublicCalculation({
    answers,
    source: 'site',
  })

  if (contact) {
    await savePublicContact(token, contact)
  }

  return { token, result }
}

describe('POST /public/calculations/:token/claim', () => {
  it('cria cliente e liquidação com o mesmo número que o consumidor viu', async () => {
    const { user } = await createTestUser()
    const { token, result } = await publicCalculation({
      name: 'Maria',
      email: 'maria@example.com',
    })

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(201)
    const { calculationId, clientId, created } = res.json()
    expect(created).toBe(true)

    const client = await systemPrisma.client.findUniqueOrThrow({
      where: { id: clientId },
    })
    expect(client.name).toBe('Maria')
    expect(client.mail).toBe('maria@example.com')

    const calculation = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id: calculationId },
    })
    expect(calculation.clientId).toBe(clientId)
    expect(calculation.calculationVersion).toBe('v3')

    // O mesmo snapshot do cálculo público: é o que garante que o advogado veja
    // o número que o cliente viu, e não o de hoje.
    const publicRow = await systemPrisma.publicCalculation.findFirstOrThrow()
    expect(calculation.indexSnapshotId).toBe(publicRow.indexSnapshotId)

    // E o número em si: a soma das verbas importadas fecha com o teto da faixa
    // mostrada ao consumidor.
    const lines = await systemPrisma.calculationVerbaLine.findMany({
      where: { laborCalculationId: calculationId },
    })
    const sum = lines.reduce((total, line) => total + Number(line.total), 0)
    expect(sum).toBeCloseTo(result.ceiling, 2)
  })

  it('marca o cálculo público como reivindicado', async () => {
    const { user, organization } = await createTestUser()
    const { token } = await publicCalculation()

    await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    const row = await systemPrisma.publicCalculation.findFirstOrThrow()
    expect(row.claimedByOrganizationId).toBe(organization.id)
    expect(row.claimedAt).not.toBeNull()
    expect(row.laborCalculationId).not.toBeNull()

    const read = await app.inject({
      method: 'GET',
      url: `/public/calculations/${token}`,
    })
    expect(read.json().claimed).toBe(true)
  })

  it('não duplica quando a mesma organização importa duas vezes', async () => {
    const { user } = await createTestUser()
    const { token } = await publicCalculation({ email: 'maria@example.com' })

    const first = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    const second = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(second.statusCode).toBe(201)
    expect(second.json().calculationId).toBe(first.json().calculationId)
    expect(second.json().created).toBe(false)

    const calculations = await systemPrisma.laborCalculation.findMany()
    expect(calculations).toHaveLength(1)
  })

  it('recusa quando outro escritório já importou', async () => {
    const { user } = await createTestUser({
      mail: 'a@test.com',
      oabNumber: 'SP/1',
      document: '111',
    })
    const { user: other } = await createTestUser({
      mail: 'b@test.com',
      oabNumber: 'SP/2',
      document: '222',
    })
    const { token } = await publicCalculation()

    await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(other.id)}` },
    })

    expect(res.statusCode).toBe(409)
  })

  it('reaproveita cliente que já existe com o mesmo e-mail', async () => {
    const { user, organization } = await createTestUser()
    const existing = await systemPrisma.client.create({
      data: {
        name: 'Maria Antiga',
        mail: 'maria@example.com',
        userId: user.id,
        organizationId: organization.id,
      },
    })
    const { token } = await publicCalculation({
      name: 'Maria',
      email: 'maria@example.com',
    })

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.json().clientId).toBe(existing.id)
    const clients = await systemPrisma.client.findMany()
    expect(clients).toHaveLength(1)
  })

  it('convida o consumidor para o portal na importação', async () => {
    const { user } = await createTestUser()
    const { token } = await publicCalculation({
      name: 'Maria',
      email: 'maria@example.com',
    })

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.json().portalInviteUrl).toContain('/portal/convite/')

    const invites = await systemPrisma.clientAccessToken.findMany({
      where: { clientId: res.json().clientId, purpose: 'invite' },
    })
    expect(invites).toHaveLength(1)
    expect(invites[0].usedAt).toBeNull()
  })

  it('não convida quando o advogado dispensa', async () => {
    const { user } = await createTestUser()
    const { token } = await publicCalculation({ email: 'maria@example.com' })

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { invitePortal: false },
    })

    expect(res.json().portalInviteUrl).toBeNull()
    const invites = await systemPrisma.clientAccessToken.findMany()
    expect(invites).toHaveLength(0)
  })

  it('não reemite convite para cliente que já usa o portal', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.client.create({
      data: {
        name: 'Maria Antiga',
        mail: 'maria@example.com',
        password: 'hash-de-senha-ja-definida',
        userId: user.id,
        organizationId: organization.id,
      },
    })
    const { token } = await publicCalculation({ email: 'maria@example.com' })

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.json().portalInviteUrl).toBeNull()
    const invites = await systemPrisma.clientAccessToken.findMany()
    expect(invites).toHaveLength(0)
  })

  it('recusa cálculo expirado', async () => {
    const { user } = await createTestUser()
    const { token } = await publicCalculation()
    await systemPrisma.publicCalculation.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(404)
  })

  it('recusa sem autenticação', async () => {
    const { token } = await publicCalculation()

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
    })

    expect(res.statusCode).toBe(401)
  })

  it('recusa estagiário', async () => {
    const { intern } = await createOrganizationWithRoles()
    const { token } = await publicCalculation()

    const res = await app.inject({
      method: 'POST',
      url: `/public/calculations/${token}/claim`,
      headers: { authorization: `Bearer ${authToken(intern.id)}` },
    })

    expect(res.statusCode).toBe(403)
  })
})
