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
 * Três cálculos do mesmo owner que diferem só nos campos filtráveis, para que
 * cada asserção isole um filtro.
 */
async function scenario() {
  const roles = await createOrganizationWithRoles()
  const base = { userId: roles.owner.id, organizationId: roles.organization.id }

  await systemPrisma.laborCalculation.create({
    data: { ...base, ...calculationFields(), clientName: 'Maria Aparecida' },
  })
  await systemPrisma.laborCalculation.create({
    data: {
      ...base,
      ...calculationFields(),
      clientName: 'João Pedro',
      calculationVersion: 'v2',
      terminationType: 'pedido_demissao',
    },
  })
  await systemPrisma.laborCalculation.create({
    data: { ...base, ...calculationFields(), clientName: 'Ana Maria' },
  })

  return roles
}

async function list(
  roles: Awaited<ReturnType<typeof scenario>>,
  query: string,
) {
  const res = await app.inject({
    method: 'GET',
    url: `/labor-calculation?${query}`,
    headers: {
      authorization: `Bearer ${token(roles.owner.id, roles.organization.id)}`,
    },
  })

  return { statusCode: res.statusCode, body: res.json() }
}

describe('filtros de GET /labor-calculation', () => {
  it('sem filtro devolve todos', async () => {
    const roles = await scenario()
    const { statusCode, body } = await list(roles, 'limit=20')

    expect(statusCode).toBe(200)
    expect(body.data).toHaveLength(3)
  })

  it('search casa clientName por substring, sem diferenciar caixa', async () => {
    const roles = await scenario()
    const { body } = await list(roles, 'limit=20&search=maria')

    expect(
      body.data.map((c: { clientName: string }) => c.clientName).sort(),
    ).toEqual(['Ana Maria', 'Maria Aparecida'])
  })

  it('terminationType filtra por igualdade', async () => {
    const roles = await scenario()
    const { body } = await list(
      roles,
      'limit=20&terminationType=pedido_demissao',
    )

    expect(body.data).toHaveLength(1)
    expect(body.data[0].clientName).toBe('João Pedro')
  })

  it('calculationVersion filtra por igualdade', async () => {
    const roles = await scenario()
    const { body } = await list(roles, 'limit=20&calculationVersion=v2')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].clientName).toBe('João Pedro')
  })

  it('filtros combinam', async () => {
    const roles = await scenario()
    const { body } = await list(
      roles,
      'limit=20&search=maria&calculationVersion=v3',
    )

    expect(body.data).toHaveLength(2)
  })

  it('search encontra registro fora da primeira página', async () => {
    const roles = await scenario()
    const { body } = await list(roles, 'limit=1&search=João')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].clientName).toBe('João Pedro')
  })
})
