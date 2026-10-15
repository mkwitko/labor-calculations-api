import { describe, expect, it } from 'vitest'
import type { LaborCalculationResultV3 } from '@/@types/labor-calculation-v3'
import { buildPublicResult, classifyVerba } from './public-result'

function resultWith(
  verbas: LaborCalculationResultV3['verbasDetalhadas'],
): LaborCalculationResultV3 {
  return { verbasDetalhadas: verbas } as LaborCalculationResultV3
}

describe('classifyVerba', () => {
  it('trata como documental o que sai do contracheque e do TRCT', () => {
    expect(classifyVerba('Saldo de Salário')).toBe('documental')
    expect(classifyVerba('13º Salário')).toBe('documental')
    expect(classifyVerba('Férias + 1/3')).toBe('documental')
    expect(classifyVerba('Aviso Prévio')).toBe('documental')
    expect(classifyVerba('FGTS 8%')).toBe('documental')
    expect(classifyVerba('Multa FGTS 40%')).toBe('documental')
    expect(classifyVerba('Multa Art. 477 CLT')).toBe('documental')
    expect(classifyVerba('Multa Art. 467 CLT')).toBe('documental')
    expect(classifyVerba('Abatimentos (FGTS depositado / verbas pagas)')).toBe(
      'documental',
    )
  })

  it('trata como prova o que depende de testemunha, perícia ou perito', () => {
    expect(classifyVerba('Horas Extras 50%')).toBe('requer_prova')
    expect(classifyVerba('Adicional Noturno 20%')).toBe('requer_prova')
    expect(classifyVerba('Adicional de Insalubridade 20%')).toBe('requer_prova')
    expect(classifyVerba('Adicional de Periculosidade 30%')).toBe(
      'requer_prova',
    )
    expect(classifyVerba('Reflexos dos Adicionais no 13º')).toBe('requer_prova')
    expect(classifyVerba('DSR sobre Horas Extras (Súm. 172)')).toBe(
      'requer_prova',
    )
  })

  it('classifica como prova o nome que não conhece', () => {
    // Verba nova no motor não pode entrar calada no piso da faixa: o piso é o
    // que prometemos que a pessoa recebe.
    expect(classifyVerba('Verba Inventada Amanhã')).toBe('requer_prova')
  })
})

describe('buildPublicResult', () => {
  it('põe no piso só as documentais e no teto tudo', () => {
    const out = buildPublicResult(
      resultWith([
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
          juros: 50,
          corrigido: 520,
          total: 570,
        },
      ]),
    )

    expect(out.floor).toBe(1000)
    expect(out.ceiling).toBe(1570)
    expect(out.lines).toHaveLength(2)
  })

  it('lista o que falta apurar, sem repetir nome', () => {
    const out = buildPublicResult(
      resultWith([
        {
          name: 'Horas Extras 50%',
          bruto: 100,
          juros: 0,
          corrigido: 100,
          total: 100,
        },
        {
          name: 'Reflexos dos Adicionais no 13º',
          bruto: 10,
          juros: 0,
          corrigido: 10,
          total: 10,
        },
        {
          name: 'Saldo de Salário',
          bruto: 900,
          juros: 0,
          corrigido: 900,
          total: 900,
        },
      ]),
    )

    expect(out.pending).toEqual([
      'Horas Extras 50%',
      'Reflexos dos Adicionais no 13º',
    ])
  })

  it('não deixa o piso passar do teto quando há abatimento', () => {
    const out = buildPublicResult(
      resultWith([
        {
          name: 'Saldo de Salário',
          bruto: 1000,
          juros: 0,
          corrigido: 1000,
          total: 1000,
        },
        {
          name: 'Abatimentos (FGTS depositado / verbas pagas)',
          bruto: -400,
          juros: 0,
          corrigido: -400,
          total: -400,
        },
      ]),
    )

    expect(out.floor).toBe(600)
    expect(out.ceiling).toBe(600)
  })
})
