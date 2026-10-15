import { describe, expect, it } from 'vitest'
import { diffFields } from './audit-log'

/**
 * O diff é o que quem audita lê. Precisa mostrar só o que mudou, e comparar
 * Decimal do Prisma com número cru sem inventar diferença.
 */

describe('diffFields', () => {
  it('lista só os campos que mudaram', () => {
    const changes = diffFields(
      { clientName: 'Fulano', lastSalary: 3500, status: 'em_andamento' },
      { clientName: 'Beltrano', lastSalary: 3500, status: 'em_andamento' },
    )

    expect(changes).toEqual({
      clientName: { from: 'Fulano', to: 'Beltrano' },
    })
  })

  it('não acusa diferença entre Decimal e número equivalente', () => {
    const decimal = {
      toFixed: (n: number) => (3500).toFixed(n),
      toString: () => '3500',
    }

    expect(
      diffFields({ lastSalary: decimal }, { lastSalary: decimal }),
    ).toEqual({})
  })

  it('acusa diferença real entre Decimals', () => {
    const a = { toFixed: () => '3500.00', toString: () => '3500' }
    const b = { toFixed: () => '7000.00', toString: () => '7000' }

    expect(diffFields({ lastSalary: a }, { lastSalary: b })).toEqual({
      lastSalary: { from: '3500', to: '7000' },
    })
  })

  it('normaliza data para ISO', () => {
    const changes = diffFields(
      { endDate: new Date('2024-06-30T00:00:00.000Z') },
      { endDate: new Date('2024-07-31T00:00:00.000Z') },
    )

    expect(changes).toEqual({
      endDate: {
        from: '2024-06-30T00:00:00.000Z',
        to: '2024-07-31T00:00:00.000Z',
      },
    })
  })

  it('ignora relações e campos de bookkeeping', () => {
    const changes = diffFields(
      { id: 'a', updatedAt: new Date(0), fgtsEntries: [{ month: 1 }] },
      { id: 'b', updatedAt: new Date(1), fgtsEntries: [{ month: 2 }] },
    )

    expect(changes).toEqual({})
  })

  it('trata nulo e ausente como a mesma coisa', () => {
    expect(diffFields({}, { observations: null })).toEqual({})
    expect(
      diffFields({ observations: null }, { observations: 'nota' }),
    ).toEqual({ observations: { from: null, to: 'nota' } })
  })
})
