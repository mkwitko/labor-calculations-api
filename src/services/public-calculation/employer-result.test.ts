import { describe, expect, it } from 'vitest'
import type { LaborCalculationResultV3 } from '@/@types/labor-calculation-v3'
import { buildEmployerResult } from './employer-result'

function resultWith(overrides: Partial<LaborCalculationResultV3>) {
  return {
    verbasDetalhadas: [],
    inssEmployer: 0,
    satRat: 0,
    custasJudiciais: 0,
    honorariosSucumbencia: 0,
    ...overrides,
  } as LaborCalculationResultV3
}

describe('buildEmployerResult', () => {
  it('soma encargo patronal ao custo do desligamento', () => {
    const out = buildEmployerResult(
      resultWith({
        verbasDetalhadas: [
          {
            name: 'Saldo de Salário',
            bruto: 1000,
            juros: 0,
            corrigido: 1000,
            total: 1000,
          },
        ],
        inssEmployer: 200,
        satRat: 30,
      }),
    )

    expect(out.employerCharges).toBe(230)
    expect(out.severanceCost).toBe(1230)
  })

  it('põe na exposição o que depende de prova e o custo do processo', () => {
    const out = buildEmployerResult(
      resultWith({
        verbasDetalhadas: [
          {
            name: 'Saldo de Salário',
            bruto: 1000,
            juros: 0,
            corrigido: 1000,
            total: 1000,
          },
          {
            name: 'Horas Extras 50%',
            bruto: 500,
            juros: 0,
            corrigido: 500,
            total: 500,
          },
        ],
        custasJudiciais: 40,
        honorariosSucumbencia: 150,
      }),
    )

    expect(out.litigationExtras).toBe(190)
    expect(out.exposure).toBe(1000 + 500 + 190)
  })

  it('mantém a identidade entre exposição, custo e diferença', () => {
    const out = buildEmployerResult(
      resultWith({
        verbasDetalhadas: [
          {
            name: 'Férias + 1/3',
            bruto: 800,
            juros: 0,
            corrigido: 800,
            total: 800,
          },
          {
            name: 'Adicional de Periculosidade 30%',
            bruto: 2000,
            juros: 100,
            corrigido: 2050,
            total: 2150,
          },
        ],
        inssEmployer: 300,
        satRat: 50,
        custasJudiciais: 60,
        honorariosSucumbencia: 200,
      }),
    )

    expect(out.gap).toBeCloseTo(out.exposure - out.severanceCost, 6)
    // O que a empresa evita arrumando a documentação: a verba que depende de
    // prova mais o custo de litigar por ela.
    expect(out.gap).toBeCloseTo(2150 + 260, 6)
  })
})
