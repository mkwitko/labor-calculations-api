import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase } from '@/tests/helpers/db'

const overtimePayload = {
  monthlySalary: 3000,
  weeklySchedule: 44,
  extraHoursPerWeek: 5,
  startDate: '2021-01-01',
  endDate: '2024-12-31',
}

describe('POST /public/calculations/horas-extras', () => {
  beforeEach(async () => {
    await app.ready()
    await cleanDatabase()
  })

  it('devolve token e resultado com corpo válido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations/horas-extras',
      payload: { ...overtimePayload, source: 'seo:horas-extras' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.token).toBeTruthy()
    expect(body.result.ceiling).toBeGreaterThan(0)
    expect(body.result.lines.length).toBeGreaterThan(0)
  })

  it('recusa jornada fora das duas permitidas', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations/horas-extras',
      payload: { ...overtimePayload, weeklySchedule: 30 },
    })

    expect(response.statusCode).toBe(400)
  })

  it('recusa salário e horas acima do teto', async () => {
    const salarioAbsurdo = await app.inject({
      method: 'POST',
      url: '/public/calculations/horas-extras',
      payload: { ...overtimePayload, monthlySalary: 5_000_000 },
    })
    expect(salarioAbsurdo.statusCode).toBe(400)

    const horasAbsurdas = await app.inject({
      method: 'POST',
      url: '/public/calculations/horas-extras',
      payload: { ...overtimePayload, extraHoursPerWeek: 100 },
    })
    expect(horasAbsurdas.statusCode).toBe(400)
  })

  it('recusa data final anterior à inicial', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations/horas-extras',
      payload: {
        ...overtimePayload,
        startDate: '2024-12-31',
        endDate: '2021-01-01',
      },
    })

    expect(response.statusCode).toBe(400)
  })

  it('404 quando a chave de widget não existe, para o escritório perceber', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations/horas-extras',
      payload: { ...overtimePayload, widgetKey: 'chave-que-nao-existe' },
    })

    expect(response.statusCode).toBe(404)
  })
})

describe('POST /public/calculations/ferias-decimo-terceiro', () => {
  beforeEach(async () => {
    await app.ready()
    await cleanDatabase()
  })

  it('aceita quem ainda trabalha na empresa, sem data de saída', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations/ferias-decimo-terceiro',
      payload: {
        monthlySalary: 3000,
        startDate: '2021-03-01',
        vacationVencidasCount: 1,
        unpaid13ths: 0,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().result.ceiling).toBeGreaterThan(0)
  })

  it('recusa contagem de férias vencidas acima do teto', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/public/calculations/ferias-decimo-terceiro',
      payload: {
        monthlySalary: 3000,
        startDate: '2021-03-01',
        vacationVencidasCount: 50,
        unpaid13ths: 0,
      },
    })

    expect(response.statusCode).toBe(400)
  })

  it('lê o cálculo de volta pelo token, com o kind', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/public/calculations/ferias-decimo-terceiro',
      payload: {
        monthlySalary: 3000,
        startDate: '2021-03-01',
        vacationVencidasCount: 1,
        unpaid13ths: 0,
      },
    })

    const { token } = created.json()

    const read = await app.inject({
      method: 'GET',
      url: `/public/calculations/${token}`,
    })

    expect(read.statusCode).toBe(200)
    expect(read.json().kind).toBe('ferias_13')
  })
})
