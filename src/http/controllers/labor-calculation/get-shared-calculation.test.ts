import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('getSharedCalculation', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await app.ready()
  })

  it('resolve a marca da organização (não mais campo removido de User) no link público', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: {
        name: 'Compartilhada Advocacia',
        logoUrl: 'https://cdn/logo-compartilhado.png',
      },
    })

    const calculation = await systemPrisma.laborCalculation.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        clientName: 'Cliente Compartilhado',
        calculationVersion: 'v3',
        terminationType: 'sem_justa_causa',
        shareCode: 'codigo-secreto',
        startDate: new Date('2020-01-01'),
        endDate: new Date('2020-06-01'),
        lastSalary: 2000,
        baseSalary: 2000,
        unpaid13ths: 0,
        vacationCount: 0,
        priorNoticeWorked: true,
        extraHours: 0,
        nightHours: 0,
        insalubrityLevel: 0,
        dangerousWork: false,
        lastThreeSalariesAvg: 2000,
        priorNoticeValue: 0,
        thirteenthSalaryValue: 0,
        vacationValue: 0,
        fgtsValue: 0,
        fgtsFineValue: 0,
        unemploymentInsuranceValue: 0,
        extraHoursValue: 0,
        nightAdditionalValue: 0,
        insalubrityValue: 0,
        dangerousWorkValue: 0,
        totalValue: 0,
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/shared-calculation/${calculation.id}`,
      query: { code: 'codigo-secreto' },
    })

    // A Tarefa 10 reconectou officeName/logoUrl para vir de Organization via
    // `brandingForUser`, então o link público agora resolve com 200 e a
    // marca correta — antes, o select por campos removidos de User quebrava
    // em runtime e só provávamos aqui que o contexto de tenant, ao menos,
    // não estourava.
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data.user.officeName).toBe('Compartilhada Advocacia')
    expect(body.data.user.logoUrl).toBe('https://cdn/logo-compartilhado.png')
  })

  it('resolve a marca da organização mesmo quando quem compartilha é apenas membro, não owner', async () => {
    // Escritório com vários assentos: a maioria das pessoas é `lawyer` ou
    // `admin`, não `owner`. Se a marca fosse resolvida por
    // `brandingForUser` (regra de "organização que a pessoa possui"), um
    // associado sem organização própria compartilhando um cálculo faria o
    // link público sair sem timbre nenhum — exatamente o segmento de
    // cliente que este recurso existe para atender. A marca correta é a da
    // organização dona do cálculo, não de quem o criou.
    const { organization } = await createTestUser()
    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: {
        name: 'Multi-assento Advocacia',
        logoUrl: 'https://cdn/logo-multi.png',
      },
    })

    const associate = await systemPrisma.user.create({
      data: {
        name: 'Advogado Associado',
        mail: `associado_${Date.now()}@test.com`,
        document: `${Date.now()}associado`,
        oabNumber: `SP/${Date.now()}associado`,
        password: 'x',
      },
    })
    await systemPrisma.membership.create({
      data: {
        userId: associate.id,
        organizationId: organization.id,
        role: 'lawyer',
      },
    })

    const calculation = await systemPrisma.laborCalculation.create({
      data: {
        userId: associate.id,
        organizationId: organization.id,
        clientName: 'Cliente do associado',
        calculationVersion: 'v3',
        terminationType: 'sem_justa_causa',
        shareCode: 'codigo-associado',
        startDate: new Date('2020-01-01'),
        endDate: new Date('2020-06-01'),
        lastSalary: 2000,
        baseSalary: 2000,
        unpaid13ths: 0,
        vacationCount: 0,
        priorNoticeWorked: true,
        extraHours: 0,
        nightHours: 0,
        insalubrityLevel: 0,
        dangerousWork: false,
        lastThreeSalariesAvg: 2000,
        priorNoticeValue: 0,
        thirteenthSalaryValue: 0,
        vacationValue: 0,
        fgtsValue: 0,
        fgtsFineValue: 0,
        unemploymentInsuranceValue: 0,
        extraHoursValue: 0,
        nightAdditionalValue: 0,
        insalubrityValue: 0,
        dangerousWorkValue: 0,
        totalValue: 0,
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/shared-calculation/${calculation.id}`,
      query: { code: 'codigo-associado' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data.user.officeName).toBe('Multi-assento Advocacia')
    expect(body.data.user.logoUrl).toBe('https://cdn/logo-multi.png')
  })
})
