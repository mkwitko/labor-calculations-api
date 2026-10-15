import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { listWidgetCalculations } from './list-widget-calculations'

type RowOverrides = {
  kind?: string
  widgetOrganizationId?: string | null
  createdAt?: Date
  expiresAt?: Date
  claimedByOrganizationId?: string
  name?: string
  referrerHost?: string
  floor?: number
  ceiling?: number
}

let seq = 0

async function widgetRow(overrides: RowOverrides = {}) {
  seq += 1

  return systemPrisma.publicCalculation.create({
    data: {
      tokenHash: `hash-widget-${seq}`,
      input: {},
      result: {
        floor: overrides.floor ?? 1000,
        ceiling: overrides.ceiling ?? 5000,
        lines: [],
        pending: [],
      },
      engineVersion: 'v3',
      source: 'widget',
      kind: overrides.kind ?? 'rescisao',
      widgetOrganizationId: overrides.widgetOrganizationId ?? null,
      referrerHost: overrides.referrerHost ?? 'advocacia.exemplo.br',
      name: overrides.name ?? 'Visitante',
      createdAt: overrides.createdAt,
      claimedByOrganizationId: overrides.claimedByOrganizationId,
      claimedAt: overrides.claimedByOrganizationId ? new Date() : null,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    },
    select: { id: true },
  })
}

describe('listWidgetCalculations', () => {
  beforeEach(async () => {
    await cleanDatabase()
    seq = 0
  })

  it('lista só o que veio do widget da própria organização', async () => {
    const mine = await createTestUser()
    const other = await createTestUser()

    const own = await widgetRow({ widgetOrganizationId: mine.organization.id })
    await widgetRow({ widgetOrganizationId: other.organization.id })
    // Cálculo do nosso próprio site, sem widget: não é fila de ninguém.
    await widgetRow({ widgetOrganizationId: null })

    const rows = await listWidgetCalculations(mine.organization.id)

    expect(rows.map((row) => row.id)).toEqual([own.id])
  })

  it('devolve a faixa do resultado e o contato', async () => {
    const { organization } = await createTestUser()
    await widgetRow({
      widgetOrganizationId: organization.id,
      floor: 2500,
      ceiling: 9000,
      name: 'Maria',
      referrerHost: 'site-do-escritorio.com.br',
    })

    const [row] = await listWidgetCalculations(organization.id)

    expect(row).toMatchObject({
      floor: 2500,
      ceiling: 9000,
      name: 'Maria',
      hostSite: 'site-do-escritorio.com.br',
      claimed: false,
    })
  })

  // A fila recebe as três calculadoras: as rotas de horas extras e férias/13º
  // também aceitam chave de widget. Sem o `kind`, a tela rotularia um cálculo de
  // verba avulsa como rescisão.
  it('diz qual calculadora gerou cada linha', async () => {
    const { organization } = await createTestUser()

    await widgetRow({
      widgetOrganizationId: organization.id,
      kind: 'horas_extras',
    })

    const [row] = await listWidgetCalculations(organization.id)

    expect(row.kind).toBe('horas_extras')
  })

  it('ordena do mais novo para o mais antigo', async () => {
    const { organization } = await createTestUser()

    const older = await widgetRow({
      widgetOrganizationId: organization.id,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    })
    const newer = await widgetRow({ widgetOrganizationId: organization.id })

    const rows = await listWidgetCalculations(organization.id)

    expect(rows.map((row) => row.id)).toEqual([newer.id, older.id])
  })

  // Sumir com a linha depois do clique faria o escritório achar que perdeu o
  // cálculo; o expirado sai porque o botão de importar já não funcionaria.
  it('mantém o importado marcado e esconde o expirado', async () => {
    const { organization } = await createTestUser()

    const claimed = await widgetRow({
      widgetOrganizationId: organization.id,
      claimedByOrganizationId: organization.id,
    })
    await widgetRow({
      widgetOrganizationId: organization.id,
      expiresAt: new Date(Date.now() - 1000),
    })

    const rows = await listWidgetCalculations(organization.id)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: claimed.id, claimed: true })
  })
})
