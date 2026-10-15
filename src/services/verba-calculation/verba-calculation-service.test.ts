import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase } from '@/tests/helpers/db'
import {
  createOvertimeCalculation,
  createVacationAnd13thCalculation,
} from './verba-calculation-service'

const overtimeInput = {
  monthlySalary: 3000,
  weeklySchedule: 44 as const,
  extraHoursPerWeek: 5,
  startDate: new Date('2021-01-01T00:00:00.000Z'),
  endDate: new Date('2024-12-31T00:00:00.000Z'),
}

describe('verba-calculation-service', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('grava o cálculo de horas extras com o kind certo', async () => {
    const { token, result } = await createOvertimeCalculation({
      input: overtimeInput,
      source: 'seo:horas-extras',
    })

    expect(token).toBeTruthy()
    expect(result.ceiling).toBeGreaterThan(0)

    const row = await systemPrisma.publicCalculation.findFirst()
    expect(row?.kind).toBe('horas_extras')
    expect(row?.engineVersion).toBe('verba-overtime@1.0.0')
    expect(row?.source).toBe('seo:horas-extras')
    expect(row?.indexSnapshotId).toBeTruthy()
  })

  it('grava o cálculo de férias e 13º com o kind certo', async () => {
    await createVacationAnd13thCalculation({
      input: {
        monthlySalary: 3000,
        startDate: new Date('2021-03-01T00:00:00.000Z'),
        vacationVencidasCount: 1,
        unpaid13ths: 0,
      },
      source: 'seo:ferias-e-13o',
    })

    const row = await systemPrisma.publicCalculation.findFirst()
    expect(row?.kind).toBe('ferias_13')
    expect(row?.engineVersion).toBe('verba-ferias13@1.0.0')
  })

  it('atribui ao escritório dono do widget quando a chave veio', async () => {
    await createOvertimeCalculation({
      input: overtimeInput,
      source: 'widget',
      widgetOrganizationId: 'org-teste',
    })

    const row = await systemPrisma.publicCalculation.findFirst()
    expect(row?.widgetOrganizationId).toBe('org-teste')
  })

  it('guarda o input cru, para a importação pelo advogado poder relê-lo', async () => {
    await createOvertimeCalculation({
      input: overtimeInput,
      source: 'site',
    })

    const row = await systemPrisma.publicCalculation.findFirst()
    const input = row?.input as unknown as { monthlySalary: number }
    expect(input.monthlySalary).toBe(3000)
  })
})
