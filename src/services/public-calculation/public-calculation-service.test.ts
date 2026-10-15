import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { PublicAnswers } from './answers-to-input'
import {
  createPublicCalculation,
  getPublicCalculationByToken,
  savePublicContact,
} from './public-calculation-service'

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

beforeEach(async () => {
  await systemPrisma.publicCalculation.deleteMany()
})

afterAll(async () => {
  await systemPrisma.publicCalculation.deleteMany()
})

describe('createPublicCalculation', () => {
  it('calcula, congela o snapshot de índices e guarda pelo hash do token', async () => {
    const { token, result } = await createPublicCalculation({
      answers,
      source: 'site',
    })

    expect(token).toHaveLength(43)
    expect(result.ceiling).toBeGreaterThan(0)
    expect(result.floor).toBeGreaterThan(0)

    const row = await systemPrisma.publicCalculation.findFirstOrThrow()
    expect(row.tokenHash).not.toBe(token)
    expect(row.engineVersion).toBe('v3')
    expect(row.indexSnapshotId).toBeTruthy()
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('getPublicCalculationByToken', () => {
  it('lê pelo token cru', async () => {
    const { token, result } = await createPublicCalculation({
      answers,
      source: 'site',
    })

    const found = await getPublicCalculationByToken(token)
    expect(found.result.ceiling).toBe(result.ceiling)
    expect(found.hasContact).toBe(false)
  })

  it('recusa token desconhecido', async () => {
    await expect(
      getPublicCalculationByToken('token-que-nao-existe'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('recusa cálculo expirado', async () => {
    const { token } = await createPublicCalculation({ answers, source: 'site' })
    await systemPrisma.publicCalculation.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    await expect(getPublicCalculationByToken(token)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('savePublicContact', () => {
  it('guarda o contato e sinaliza que já foi dado', async () => {
    const { token } = await createPublicCalculation({ answers, source: 'site' })

    await savePublicContact(token, {
      name: 'Maria',
      email: 'maria@example.com',
      phone: '11999998888',
    })

    const row = await systemPrisma.publicCalculation.findFirstOrThrow()
    expect(row.name).toBe('Maria')
    expect(row.email).toBe('maria@example.com')
    expect(row.phone).toBe('11999998888')

    const found = await getPublicCalculationByToken(token)
    expect(found.hasContact).toBe(true)
  })

  it('preserva o que já havia quando o campo não vem', async () => {
    const { token } = await createPublicCalculation({ answers, source: 'site' })

    await savePublicContact(token, { email: 'maria@example.com' })
    await savePublicContact(token, { name: 'Maria' })

    const row = await systemPrisma.publicCalculation.findFirstOrThrow()
    expect(row.name).toBe('Maria')
    expect(row.email).toBe('maria@example.com')
  })
})
