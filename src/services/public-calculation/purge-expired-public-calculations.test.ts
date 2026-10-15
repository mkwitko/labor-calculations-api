import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { purgeExpiredPublicCalculations } from './purge-expired-public-calculations'

const baseRow = {
  input: {},
  result: {},
  engineVersion: 'v3',
  source: 'site',
}

beforeEach(async () => {
  await systemPrisma.publicCalculation.deleteMany()
})

afterAll(async () => {
  await systemPrisma.publicCalculation.deleteMany()
})

describe('purgeExpiredPublicCalculations', () => {
  it('apaga o vencido e preserva o vigente', async () => {
    await systemPrisma.publicCalculation.createMany({
      data: [
        {
          ...baseRow,
          tokenHash: 'vencido',
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          ...baseRow,
          tokenHash: 'vigente',
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    })

    const deleted = await purgeExpiredPublicCalculations()

    expect(deleted).toBe(1)
    const rest = await systemPrisma.publicCalculation.findMany()
    expect(rest.map((row) => row.tokenHash)).toEqual(['vigente'])
  })

  it('preserva o vencido que já virou cliente de alguém', async () => {
    await systemPrisma.publicCalculation.create({
      data: {
        ...baseRow,
        tokenHash: 'convertido',
        expiresAt: new Date(Date.now() - 1000),
        clientId: 'algum-cliente',
      },
    })

    const deleted = await purgeExpiredPublicCalculations()

    expect(deleted).toBe(0)
  })
})
