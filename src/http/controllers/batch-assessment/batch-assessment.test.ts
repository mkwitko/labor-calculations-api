import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
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

function row(reference: string, overrides: Record<string, unknown> = {}) {
  return {
    reference,
    terminationType: 'sem_justa_causa',
    startDate: '2020-01-10',
    endDate: '2024-06-20',
    lastSalary: 3000,
    priorNoticeWorked: false,
    unpaid13ths: 0,
    vacationVencidasCount: 1,
    extraHours: 'nao',
    nightWork: 'nao',
    insalubrity: 'nao',
    dangerousWork: 'nao',
    ...overrides,
  }
}

describe('POST /batch-assessments', () => {
  it('calcula a folha e agrega os totais', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: {
        name: 'Cliente X — folha de julho',
        rows: [row('001'), row('002', { lastSalary: 6000 })],
      },
    })

    expect(res.statusCode).toBe(201)
    const batch = res.json()
    expect(batch.rowCount).toBe(2)
    expect(batch.failedCount).toBe(0)
    expect(Number(batch.exposure)).toBeGreaterThan(Number(batch.severanceCost))
    expect(Number(batch.gap)).toBeCloseTo(
      Number(batch.exposure) - Number(batch.severanceCost),
      2,
    )

    const rows = await systemPrisma.batchAssessmentRow.findMany()
    const soma = rows.reduce((total, r) => total + Number(r.exposure ?? 0), 0)
    expect(soma).toBeCloseTo(Number(batch.exposure), 2)
  })

  it('linha inválida não derruba o lote', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: {
        name: 'Folha com problema',
        rows: [
          row('boa'),
          // Desligamento antes da admissão: erra a linha, não o arquivo.
          row('ruim', { startDate: '2024-06-20', endDate: '2020-01-10' }),
        ],
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().rowCount).toBe(2)
    expect(res.json().failedCount).toBe(1)

    const ruim = await systemPrisma.batchAssessmentRow.findFirstOrThrow({
      where: { reference: 'ruim' },
    })
    expect(ruim.error).toContain('anterior')
    expect(ruim.exposure).toBeNull()
  })

  it('usa um único snapshot de índices para o lote', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { name: 'Snapshot', rows: [row('a'), row('b'), row('c')] },
    })

    const batch = await systemPrisma.batchAssessment.findUniqueOrThrow({
      where: { id: res.json().id },
    })
    expect(batch.indexSnapshotId).toBeTruthy()
  })

  it('recusa mais linhas do que o limite por requisição', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: {
        name: 'Folha grande demais',
        rows: Array.from({ length: 301 }, (_, i) => row(`m${i}`)),
      },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('POST /batch-assessments/:id/rows', () => {
  it('acrescenta a segunda parte reusando o snapshot e recalcula', async () => {
    const { user } = await createTestUser()

    const created = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { name: 'Em partes', rows: [row('parte1')] },
    })
    const batchId = created.json().id
    const snapshotBefore = (
      await systemPrisma.batchAssessment.findUniqueOrThrow({
        where: { id: batchId },
      })
    ).indexSnapshotId

    const appended = await app.inject({
      method: 'POST',
      url: `/batch-assessments/${batchId}/rows`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { rows: [row('parte2'), row('parte3')] },
    })

    expect(appended.statusCode).toBe(200)
    expect(appended.json().rowCount).toBe(3)
    expect(Number(appended.json().exposure)).toBeGreaterThan(
      Number(created.json().exposure),
    )

    const batch = await systemPrisma.batchAssessment.findUniqueOrThrow({
      where: { id: batchId },
    })
    expect(batch.indexSnapshotId).toBe(snapshotBefore)
  })
})

describe('GET /batch-assessments', () => {
  it('ordena as linhas pela maior exposição', async () => {
    const { user } = await createTestUser()

    const created = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: {
        name: 'Ordenação',
        rows: [
          row('pequeno', { lastSalary: 2000 }),
          row('grande', { lastSalary: 20000 }),
          row('erro', { startDate: '2024-01-01', endDate: '2020-01-01' }),
        ],
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/batch-assessments/${created.json().id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    const { rows } = res.json()
    expect(rows[0].reference).toBe('grande')
    expect(rows[1].reference).toBe('pequeno')
    // Linha com erro vai para o fim: não tem exposição para comparar.
    expect(rows[2].reference).toBe('erro')
  })

  it('não enxerga avaliação de outra organização', async () => {
    const { user } = await createTestUser()
    const { user: outro } = await createTestUser({
      mail: 'outro@test.com',
      oabNumber: 'SP/77',
      document: '777',
    })

    const created = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { name: 'Do primeiro', rows: [row('x')] },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/batch-assessments/${created.json().id}`,
      headers: { authorization: `Bearer ${authToken(outro.id)}` },
    })

    expect(res.statusCode).toBe(404)

    const list = await app.inject({
      method: 'GET',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(outro.id)}` },
    })
    expect(list.json()).toHaveLength(0)
  })
})

describe('DELETE /batch-assessments/:id', () => {
  it('exclui logicamente e some da lista', async () => {
    const { user } = await createTestUser()

    const created = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { name: 'Para excluir', rows: [row('x')] },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/batch-assessments/${created.json().id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(204)

    const list = await app.inject({
      method: 'GET',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(list.json()).toHaveLength(0)

    const row0 = await systemPrisma.batchAssessment.findUniqueOrThrow({
      where: { id: created.json().id },
    })
    expect(row0.deletedAt).not.toBeNull()
  })
})

describe('GET /batch-assessments/:batchId/rows/:rowId', () => {
  async function createBatch(userId: string, rows: unknown[]) {
    const res = await app.inject({
      method: 'POST',
      url: '/batch-assessments',
      headers: { authorization: `Bearer ${authToken(userId)}` },
      payload: { name: 'Lote breakdown', rows },
    })
    expect(res.statusCode).toBe(201)
    return res.json() as { id: string }
  }

  it('devolve o demonstrativo da linha, e as somas fecham', async () => {
    const { user } = await createTestUser()
    const batch = await createBatch(user.id, [
      row('001', { insalubrity: 'sim' }),
    ])
    const stored = await systemPrisma.batchAssessmentRow.findFirstOrThrow()

    const res = await app.inject({
      method: 'GET',
      url: `/batch-assessments/${batch.id}/rows/${stored.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.reference).toBe('001')

    // Recomputo bate com o que foi gravado na criação do lote.
    expect(body.severanceCost).toBeCloseTo(Number(stored.severanceCost), 2)
    expect(body.exposure).toBeCloseTo(Number(stored.exposure), 2)
    expect(body.gap).toBeCloseTo(Number(stored.gap), 2)

    // Documentais + encargos = custo; + requer prova + custas/honorários = exposição.
    const documental = body.verbas
      .filter((v: { certainty: string }) => v.certainty === 'documental')
      .reduce((s: number, v: { total: number }) => s + v.total, 0)
    const requerProva = body.verbas
      .filter((v: { certainty: string }) => v.certainty === 'requer_prova')
      .reduce((s: number, v: { total: number }) => s + v.total, 0)
    expect(documental + body.employerCharges).toBeCloseTo(body.severanceCost, 2)
    expect(
      body.severanceCost + requerProva + body.litigationExtras,
    ).toBeCloseTo(body.exposure, 2)
    // Insalubridade ligada tem que aparecer como requer prova.
    expect(
      body.verbas.some(
        (v: { name: string; certainty: string }) =>
          v.name.toLowerCase().includes('insalubridade') &&
          v.certainty === 'requer_prova',
      ),
    ).toBe(true)
  })

  it('linha com erro responde 422 com o motivo', async () => {
    const { user } = await createTestUser()
    const batch = await createBatch(user.id, [
      row('ok'),
      row('ruim', { startDate: '2024-06-20', endDate: '2020-01-10' }),
    ])
    const bad = await systemPrisma.batchAssessmentRow.findFirstOrThrow({
      where: { error: { not: null } },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/batch-assessments/${batch.id}/rows/${bad.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(422)
  })

  it('linha de outro lote não existe daqui (404)', async () => {
    const { user } = await createTestUser()
    const a = await createBatch(user.id, [row('001')])
    const b = await createBatch(user.id, [row('002')])
    const rowOfB = await systemPrisma.batchAssessmentRow.findFirstOrThrow({
      where: { batchId: b.id },
    })
    // rowId existe, mas sob outro batchId — não pode vazar.
    const res = await app.inject({
      method: 'GET',
      url: `/batch-assessments/${a.id}/rows/${rowOfB.id}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('lote de outra organização não existe (404)', async () => {
    const { user } = await createTestUser()
    const batch = await createBatch(user.id, [row('001')])
    const stored = await systemPrisma.batchAssessmentRow.findFirstOrThrow()
    const { user: intruder } = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: `/batch-assessments/${batch.id}/rows/${stored.id}`,
      headers: { authorization: `Bearer ${authToken(intruder.id)}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
