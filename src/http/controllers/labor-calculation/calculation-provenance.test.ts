import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { V3_ENGINE_VERSION } from '@/services/labor-calculation/labor-calculation-v3'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

/**
 * Procedência do cálculo.
 *
 * `MonetaryIndex` é global e mutável. Antes do snapshot, editar um cálculo
 * salvo reaplicava os índices vigentes e podia mover o total sem que ninguém
 * tivesse mudado um input — corrigir o nome do cliente mudava o valor da causa.
 * Estes testes travam o comportamento novo: o total só se move quando um input
 * que o afeta se move.
 */

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

async function session() {
  const { user, organization } = await createTestUser()
  const token = app.jwt.sign({ sub: user.id, org: organization.id })
  return { user, organization, token }
}

const V3_BODY = {
  clientName: 'Fulano de Tal',
  startDate: '2020-01-15',
  endDate: '2024-06-30',
  lastSalary: 3500,
  baseSalary: 3500,
  unpaid13ths: 1,
  vacationCount: 1,
  vacationVencidasCount: 0,
  priorNoticeWorked: false,
  extraHours: 20,
  nightHours: 0,
  insalubrityLevel: 0,
  dangerousWork: false,
  lastThreeSalariesAvg: 3500,
  applyArt477Fine: true,
  terminationType: 'sem_justa_causa',
  liquidationDate: '2025-06-30',
}

async function createCalculation(token: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/labor-calculation/v3',
    cookies: { accessToken: token },
    payload: V3_BODY,
  })

  expect(response.statusCode).toBe(201)
  return response.json().id as string
}

/** Move os índices do jeito mais agressivo possível, para não haver dúvida. */
async function bumpMonetaryIndices() {
  const months = ['2024-06', '2024-12', '2025-01', '2025-06']
  for (const month of months) {
    const [year, m] = month.split('-').map(Number)
    await systemPrisma.monetaryIndex.upsert({
      where: { month: new Date(Date.UTC(year, m - 1, 1)) },
      create: {
        month: new Date(Date.UTC(year, m - 1, 1)),
        ipcaE: 5,
        ipcaECumulative: 3,
        selic: 2,
        selicCumulative: 3,
        trd: 1,
      },
      update: { ipcaECumulative: 3, selicCumulative: 3, trd: 1 },
    })
  }
}

describe('procedência do cálculo v3', () => {
  it('grava snapshot de índices e versão do motor no create', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const saved = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
      include: { indexSnapshot: true },
    })

    expect(saved.indexSnapshotId).not.toBeNull()
    expect(saved.engineVersion).toBe(V3_ENGINE_VERSION)
    expect(saved.indexSnapshot?.entryCount).toBeGreaterThan(0)
  })

  it('editar campo neutro não muda o total, mesmo com índices alterados', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const before = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    await bumpMonetaryIndices()

    const update = await app.inject({
      method: 'PUT',
      url: `/labor-calculation/v3/${id}`,
      cookies: { accessToken: token },
      payload: { clientName: 'Fulano de Tal Corrigido' },
    })
    expect(update.statusCode).toBe(204)

    const after = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    expect(after.clientName).toBe('Fulano de Tal Corrigido')
    expect(after.totalValue.toString()).toBe(before.totalValue.toString())
    expect(after.correctionTotal.toString()).toBe(
      before.correctionTotal.toString(),
    )
    expect(after.interestTotal.toString()).toBe(before.interestTotal.toString())
    expect(after.indexSnapshotId).toBe(before.indexSnapshotId)
  })

  it('editar campo neutro preserva flags com default (multa art. 477)', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    await app.inject({
      method: 'PUT',
      url: `/labor-calculation/v3/${id}`,
      cookies: { accessToken: token },
      payload: { observations: 'anotação qualquer' },
    })

    const after = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    // `.partial()` do zod mantinha o `.default(false)`, então um PUT sem o
    // campo zerava a multa de um cálculo já salvo.
    expect(after.applyArt477Fine).toBe(true)
    expect(Number(after.art477FineValue)).toBeGreaterThan(0)
  })

  it('mudar um input que afeta a conta ainda muda o total', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const before = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    const update = await app.inject({
      method: 'PUT',
      url: `/labor-calculation/v3/${id}`,
      cookies: { accessToken: token },
      payload: {
        lastSalary: 7000,
        baseSalary: 7000,
        lastThreeSalariesAvg: 7000,
      },
    })
    expect(update.statusCode).toBe(204)

    const after = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    expect(Number(after.totalValue)).toBeGreaterThan(Number(before.totalValue))
    // O snapshot continua o mesmo: mudou o input, não a tabela de índices.
    expect(after.indexSnapshotId).toBe(before.indexSnapshotId)
  })

  it('cálculo legado (sem snapshot) adota a tabela vigente ao ser editado', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    // Simula o estado anterior à migração de procedência.
    await systemPrisma.laborCalculation.update({
      where: { id },
      data: { indexSnapshotId: null, engineVersion: null },
    })

    const update = await app.inject({
      method: 'PUT',
      url: `/labor-calculation/v3/${id}`,
      cookies: { accessToken: token },
      payload: { clientName: 'Legado' },
    })
    expect(update.statusCode).toBe(204)

    const after = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    expect(after.indexSnapshotId).not.toBeNull()
    expect(after.engineVersion).toBe(V3_ENGINE_VERSION)
  })

  it('persiste a memória de cálculo, na ordem do motor', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const lines = await systemPrisma.calculationVerbaLine.findMany({
      where: { laborCalculationId: id },
      orderBy: { order: 'asc' },
    })

    expect(lines.length).toBeGreaterThan(0)
    expect(lines.map((l) => l.order)).toEqual(lines.map((_, i) => i))
    expect(lines.some((l) => l.name === 'Saldo de Salário')).toBe(true)
    for (const line of lines) {
      expect(Number(line.total)).toBeCloseTo(
        Number(line.corrigido) + Number(line.juros),
        2,
      )
    }
  })

  /**
   * INVARIANTE DA MEMÓRIA DE CÁLCULO.
   *
   * A conferência é contra `brutoDevidoReclamante`, não contra `totalValue`:
   * este último herda do V2 uma mistura de categorias (o FGTS entra já corrigido
   * e com juros, o resto entra bruto) e soma o seguro-desemprego, que é
   * benefício previdenciário e não dívida do reclamado.
   *
   * `brutoDevidoReclamante` é o que o reclamado deve, corrigido e com juros —
   * exatamente o que a soma das linhas do laudo tem de dar. É também o que
   * impede um adicional de ser contado duas vezes.
   */
  it('a soma da memória de cálculo fecha com o bruto devido', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const saved = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
      include: { verbaLines: true },
    })

    const soma = saved.verbaLines.reduce((acc, l) => acc + Number(l.total), 0)

    expect(soma).toBeCloseTo(Number(saved.brutoDevidoReclamante), 1)
  })

  it('fecha também com adicionais, reflexos e abatimentos em jogo', async () => {
    const { token } = await session()

    const response = await app.inject({
      method: 'POST',
      url: '/labor-calculation/v3',
      cookies: { accessToken: token },
      payload: {
        ...V3_BODY,
        nightHours: 40,
        insalubrityLevel: 20,
        dangerousWork: true,
        applyDsrOnExtra: true,
        applyArt467: true,
        stabilityMonths: 3,
        intervalIntrajornadaHours: 10,
        transferAdditionalMonths: 6,
        fgtsAlreadyDeposited: 1200,
        amountsAlreadyPaid: 800,
      },
    })
    expect(response.statusCode).toBe(201)

    const saved = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id: response.json().id },
      include: { verbaLines: true },
    })

    const soma = saved.verbaLines.reduce((acc, l) => acc + Number(l.total), 0)

    expect(soma).toBeCloseTo(Number(saved.brutoDevidoReclamante), 1)
  })

  it('toda linha da memória de cálculo tem fundamento legal', async () => {
    const { token } = await session()

    // Cenário cheio de propósito: no caso simples as verbas opcionais valem
    // zero e não viram linha, então um fundamento faltando passaria batido.
    const response = await app.inject({
      method: 'POST',
      url: '/labor-calculation/v3',
      cookies: { accessToken: token },
      payload: {
        ...V3_BODY,
        nightHours: 40,
        insalubrityLevel: 20,
        dangerousWork: true,
        applyDsrOnExtra: true,
        applyArt467: true,
        stabilityMonths: 3,
        intervalIntrajornadaHours: 10,
        transferAdditionalMonths: 6,
        fgtsAlreadyDeposited: 1200,
        amountsAlreadyPaid: 800,
      },
    })
    expect(response.statusCode).toBe(201)

    const lines = await systemPrisma.calculationVerbaLine.findMany({
      where: { laborCalculationId: response.json().id },
    })

    expect(lines.length).toBeGreaterThan(15)
    expect(lines.filter((l) => !l.legalRef).map((l) => l.name)).toEqual([])
  })

  it('horas extras têm linha própria', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const lines = await systemPrisma.calculationVerbaLine.findMany({
      where: { laborCalculationId: id },
    })

    const horasExtras = lines.find((l) => l.name === 'Horas Extras 50%')

    expect(horasExtras).toBeDefined()
    expect(Number(horasExtras?.bruto)).toBeGreaterThan(0)
    expect(horasExtras?.legalRef).toContain('art. 59')
  })

  it('reescreve a memória de cálculo ao editar', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    await app.inject({
      method: 'PUT',
      url: `/labor-calculation/v3/${id}`,
      cookies: { accessToken: token },
      payload: {
        lastSalary: 7000,
        baseSalary: 7000,
        lastThreeSalariesAvg: 7000,
      },
    })

    const saved = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
      include: { verbaLines: true },
    })

    // Sem o deleteMany, a edição duplicaria as linhas e o laudo somaria duas
    // vezes; a unique em (laborCalculationId, order) faria o update explodir.
    const orders = saved.verbaLines.map((l) => l.order)
    expect(new Set(orders).size).toBe(orders.length)

    // E as linhas refletem o input novo, não o antigo.
    const salario = saved.verbaLines.find(
      (l) => l.name === 'Multa Art. 477 CLT',
    )
    expect(Number(salario?.bruto)).toBe(7000)
  })

  it('reindexar sem confirm não persiste nada', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const before = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    await bumpMonetaryIndices()

    const response = await app.inject({
      method: 'POST',
      url: `/labor-calculation/${id}/reindex`,
      cookies: { accessToken: token },
      payload: { confirm: false },
    })
    expect(response.statusCode).toBe(200)

    const preview = response.json()
    expect(preview.applied).toBe(false)
    expect(preview.indexSnapshot.unchanged).toBe(false)
    expect(preview.totals.totalValue.from).toBeCloseTo(
      Number(before.totalValue),
      2,
    )
    expect(preview.totals.totalValue.delta).not.toBe(0)

    const after = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })
    expect(after.totalValue.toString()).toBe(before.totalValue.toString())
    expect(after.indexSnapshotId).toBe(before.indexSnapshotId)
    expect(after.indexesUpdatedAt).toBeNull()
  })

  it('reindexar com confirm adota os índices novos e registra quando', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const before = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    await bumpMonetaryIndices()

    const response = await app.inject({
      method: 'POST',
      url: `/labor-calculation/${id}/reindex`,
      cookies: { accessToken: token },
      payload: { confirm: true },
    })
    expect(response.statusCode).toBe(200)

    const applied = response.json()
    expect(applied.applied).toBe(true)

    const after = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
      include: { verbaLines: true },
    })

    expect(after.indexSnapshotId).not.toBe(before.indexSnapshotId)
    expect(after.indexesUpdatedAt).not.toBeNull()
    expect(Number(after.totalValue)).toBeCloseTo(
      applied.totals.totalValue.to,
      2,
    )
    // A memória de cálculo acompanha, sem duplicar linhas.
    const orders = after.verbaLines.map((l) => l.order)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('reindexar duas vezes seguidas é idempotente', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    await bumpMonetaryIndices()

    await app.inject({
      method: 'POST',
      url: `/labor-calculation/${id}/reindex`,
      cookies: { accessToken: token },
      payload: { confirm: true },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/labor-calculation/${id}/reindex`,
      cookies: { accessToken: token },
      payload: { confirm: true },
    })

    const second = response.json()
    expect(second.indexSnapshot.unchanged).toBe(true)
    expect(second.totals.totalValue.delta).toBe(0)
  })

  it('registra a trilha de auditoria e a expõe', async () => {
    const { token, user } = await session()
    const id = await createCalculation(token)

    await app.inject({
      method: 'PUT',
      url: `/labor-calculation/v3/${id}`,
      cookies: { accessToken: token },
      payload: { lastSalary: 7000 },
    })

    await app.inject({
      method: 'PATCH',
      url: `/labor-calculation/${id}/status`,
      cookies: { accessToken: token },
      payload: { status: 'ajuizado' },
    })

    await bumpMonetaryIndices()
    await app.inject({
      method: 'POST',
      url: `/labor-calculation/${id}/reindex`,
      cookies: { accessToken: token },
      payload: { confirm: true },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/labor-calculation/${id}/audit`,
      cookies: { accessToken: token },
    })
    expect(response.statusCode).toBe(200)

    const trail = response.json() as Array<{
      action: string
      userId: string | null
      userName: string | null
      changes: Record<string, { from: unknown; to: unknown }> | null
    }>

    // Mais recente primeiro.
    expect(trail.map((e) => e.action)).toEqual([
      'reindex',
      'status_change',
      'update',
      'create',
    ])
    expect(trail.every((e) => e.userId === user.id)).toBe(true)
    expect(trail[0].userName).toBe(user.name)

    const statusEntry = trail.find((e) => e.action === 'status_change')
    expect(statusEntry?.changes?.status).toEqual({
      from: 'em_andamento',
      to: 'ajuizado',
    })

    const updateEntry = trail.find((e) => e.action === 'update')
    expect(updateEntry?.changes?.lastSalary).toEqual({
      from: '3500',
      to: '7000',
    })
    // Diff é só do que mudou: o nome do cliente ficou igual.
    expect(updateEntry?.changes?.clientName).toBeUndefined()

    const reindexEntry = trail.find((e) => e.action === 'reindex')
    expect(reindexEntry?.changes?.indexSnapshotHash).toBeDefined()
  })

  it('não expõe a trilha de cálculo invisível ao requisitante', async () => {
    const owner = await session()
    const id = await createCalculation(owner.token)

    const outro = await session()
    const response = await app.inject({
      method: 'GET',
      url: `/labor-calculation/${id}/audit`,
      cookies: { accessToken: outro.token },
    })

    expect(response.statusCode).toBe(404)
  })

  it('registra a exclusão', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    await app.inject({
      method: 'DELETE',
      url: `/labor-calculation/${id}`,
      cookies: { accessToken: token },
    })

    const entries = await systemPrisma.auditLog.findMany({
      where: { entityId: id },
      orderBy: { createdAt: 'desc' },
    })

    expect(entries[0]?.action).toBe('delete')
  })

  it('cenários usam a tabela congelada do cálculo', async () => {
    const { token } = await session()
    const id = await createCalculation(token)

    const stored = await systemPrisma.laborCalculation.findUniqueOrThrow({
      where: { id },
    })

    await bumpMonetaryIndices()

    const response = await app.inject({
      method: 'GET',
      url: `/labor-calculation/${id}/scenarios`,
      cookies: { accessToken: token },
    })
    expect(response.statusCode).toBe(200)

    const scenarios = response.json() as Array<{
      label: string
      totalValue: number
    }>
    const current = scenarios.find((s) => s.label === 'Cenário atual')

    expect(current?.totalValue).toBeCloseTo(Number(stored.totalValue), 2)
  })
})
