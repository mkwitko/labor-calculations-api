import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase } from '@/tests/helpers/db'
import {
  hashIndexTable,
  loadSnapshotTable,
  resolveIndexTable,
} from './index-snapshot'
import type { IndexEntry } from './index-table'

/**
 * O hash é o que torna um cálculo reproduzível: mesmo hash ⇒ mesma tabela de
 * índices ⇒ mesmo total. Por isso ele precisa ser insensível à ordem das linhas
 * e à representação do número (o Prisma devolve Decimal, o default é float
 * literal), e sensível a qualquer mudança de valor.
 */

function entry(month: string, over: Partial<IndexEntry> = {}): IndexEntry {
  return {
    month,
    ipcaE: 0.42,
    ipcaECumulative: 1.0042,
    selic: 0.9,
    selicCumulative: 1.009,
    trd: 0,
    ...over,
  }
}

afterAll(async () => {
  await systemPrisma.$disconnect()
})

describe('hashIndexTable', () => {
  it('ignora a ordem das entradas', () => {
    const a = [entry('2024-01'), entry('2024-02'), entry('2024-03')]
    const b = [entry('2024-03'), entry('2024-01'), entry('2024-02')]

    expect(hashIndexTable(a)).toBe(hashIndexTable(b))
  })

  it('normaliza ruído de float além da 8ª casa', () => {
    const a = [entry('2024-01', { ipcaECumulative: 1.0042 })]
    const b = [entry('2024-01', { ipcaECumulative: 1.004200000001 })]

    expect(hashIndexTable(a)).toBe(hashIndexTable(b))
  })

  it('muda quando um valor muda', () => {
    const a = [entry('2024-01', { trd: 0 })]
    const b = [entry('2024-01', { trd: 0.1709 })]

    expect(hashIndexTable(a)).not.toBe(hashIndexTable(b))
  })

  it('muda quando um mês é acrescentado', () => {
    const a = [entry('2024-01')]
    const b = [entry('2024-01'), entry('2024-02')]

    expect(hashIndexTable(a)).not.toBe(hashIndexTable(b))
  })

  it('distingue meses com os mesmos valores', () => {
    const a = [entry('2024-01')]
    const b = [entry('2024-02')]

    expect(hashIndexTable(a)).not.toBe(hashIndexTable(b))
  })

  it('não colapsa diferenças além da 8ª casa decimal em ruído de float', () => {
    const a = [entry('2024-01', { selicCumulative: 1.00000001 })]
    const b = [entry('2024-01', { selicCumulative: 1.00000002 })]

    expect(hashIndexTable(a)).not.toBe(hashIndexTable(b))
  })

  it('devolve sha256 em hex', () => {
    expect(hashIndexTable([entry('2024-01')])).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('resolveIndexTable', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('grava um snapshot da tabela vigente', async () => {
    const { snapshotId, hash, table } = await resolveIndexTable()

    const saved = await systemPrisma.indexTableSnapshot.findUnique({
      where: { id: snapshotId },
    })

    expect(saved).not.toBeNull()
    expect(saved?.hash).toBe(hash)
    expect(saved?.entryCount).toBe(table.size)
    expect(saved?.minMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(saved?.maxMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(saved?.minMonth.localeCompare(saved.maxMonth)).toBeLessThanOrEqual(0)
  })

  it('reaproveita o snapshot quando a tabela não mudou', async () => {
    const first = await resolveIndexTable()
    const second = await resolveIndexTable()

    expect(second.snapshotId).toBe(first.snapshotId)
    expect(await systemPrisma.indexTableSnapshot.count()).toBe(1)
  })

  it('cria snapshot novo quando um índice é alterado', async () => {
    const first = await resolveIndexTable()

    await systemPrisma.monetaryIndex.create({
      data: {
        month: new Date(Date.UTC(2024, 0, 1)),
        ipcaE: 9.99,
        ipcaECumulative: 1.0999,
        selic: 0.99,
        selicCumulative: 1.0099,
        trd: 0.5,
      },
    })

    const second = await resolveIndexTable()

    expect(second.hash).not.toBe(first.hash)
    expect(second.snapshotId).not.toBe(first.snapshotId)
    expect(await systemPrisma.indexTableSnapshot.count()).toBe(2)
  })

  it('sobrevive a duas resoluções concorrentes da mesma tabela', async () => {
    const [a, b] = await Promise.all([resolveIndexTable(), resolveIndexTable()])

    expect(a.snapshotId).toBe(b.snapshotId)
    expect(await systemPrisma.indexTableSnapshot.count()).toBe(1)
  })
})

describe('loadSnapshotTable', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('reidrata a tabela idêntica à que foi congelada', async () => {
    const { snapshotId, table } = await resolveIndexTable()

    const restored = await loadSnapshotTable(snapshotId)

    expect(restored.size).toBe(table.size)
    for (const [month, original] of table) {
      expect(restored.get(month)).toEqual(original)
    }
  })

  it('congela: mudar MonetaryIndex depois não afeta o snapshot', async () => {
    const { snapshotId } = await resolveIndexTable()
    const before = await loadSnapshotTable(snapshotId)

    await systemPrisma.monetaryIndex.create({
      data: {
        month: new Date(Date.UTC(2024, 0, 1)),
        ipcaE: 9.99,
        ipcaECumulative: 9.9999,
        selic: 0.99,
        selicCumulative: 1.0099,
        trd: 0.5,
      },
    })

    const after = await loadSnapshotTable(snapshotId)

    expect(after.get('2024-01')).toEqual(before.get('2024-01'))
  })

  it('404 quando o snapshot não existe', async () => {
    await expect(loadSnapshotTable('nao-existe')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
