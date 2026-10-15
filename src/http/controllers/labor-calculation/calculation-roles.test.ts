import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createOrganizationWithRoles } from '@/tests/helpers/db'

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

function token(userId: string, organizationId: string): string {
  return app.jwt.sign({ sub: userId, org: organizationId })
}

function calculationFields() {
  const money = '1000.00'

  return {
    clientName: 'Cliente',
    calculationVersion: 'v3',
    terminationType: 'sem_justa_causa' as const,
    startDate: new Date('2020-01-01'),
    endDate: new Date('2024-01-01'),
    lastSalary: money,
    baseSalary: money,
    unpaid13ths: 0,
    vacationCount: 0,
    priorNoticeWorked: false,
    extraHours: '0',
    nightHours: '0',
    insalubrityLevel: 0,
    dangerousWork: false,
    lastThreeSalariesAvg: money,
    priorNoticeValue: money,
    thirteenthSalaryValue: money,
    vacationValue: money,
    fgtsValue: money,
    fgtsFineValue: money,
    unemploymentInsuranceValue: money,
    extraHoursValue: money,
    nightAdditionalValue: money,
    insalubrityValue: money,
    dangerousWorkValue: money,
    totalValue: money,
  }
}

/**
 * Um cálculo preso ao caso do owner e um cálculo solto do associado — as duas
 * pernas de `calculationVisibility`.
 */
async function scenario() {
  const roles = await createOrganizationWithRoles()

  const ownerCase = await systemPrisma.case.create({
    data: {
      title: 'Caso do owner',
      assignedToId: roles.owner.id,
      organizationId: roles.organization.id,
    },
    select: { id: true },
  })

  const boundCalc = await systemPrisma.laborCalculation.create({
    data: {
      userId: roles.owner.id,
      organizationId: roles.organization.id,
      caseId: ownerCase.id,
      ...calculationFields(),
    },
    select: { id: true },
  })

  const looseCalc = await systemPrisma.laborCalculation.create({
    data: {
      userId: roles.lawyer.id,
      organizationId: roles.organization.id,
      ...calculationFields(),
      clientName: 'Estimativa do associado',
    },
    select: { id: true },
  })

  return { ...roles, ownerCase, boundCalc, looseCalc }
}

describe('visibilidade de cálculo por papel', () => {
  it('lawyer recebe 404 no cálculo do caso do owner', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'GET',
      url: `/labor-calculation/${s.boundCalc.id}`,
      headers: {
        authorization: `Bearer ${token(s.lawyer.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('lawyer acessa a própria estimativa solta', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'GET',
      url: `/labor-calculation/${s.looseCalc.id}`,
      headers: {
        authorization: `Bearer ${token(s.lawyer.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('admin acessa os dois', async () => {
    const s = await scenario()
    for (const id of [s.boundCalc.id, s.looseCalc.id]) {
      const res = await app.inject({
        method: 'GET',
        url: `/labor-calculation/${id}`,
        headers: {
          authorization: `Bearer ${token(s.admin.id, s.organization.id)}`,
        },
      })
      expect(res.statusCode).toBe(200)
    }
  })
})

describe('portão de financeiro', () => {
  it('lawyer recebe 403 no dashboard financeiro', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/finance',
      headers: {
        authorization: `Bearer ${token(s.lawyer.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(403)
  })

  it('staff acessa o dashboard financeiro', async () => {
    const s = await scenario()
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/finance',
      headers: {
        authorization: `Bearer ${token(s.staff.id, s.organization.id)}`,
      },
    })

    expect(res.statusCode).toBe(200)
  })
})
