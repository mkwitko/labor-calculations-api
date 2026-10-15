import { describe, expect, it } from 'vitest'
import { datajudAliasFor, parseCnjNumber } from './datajud-service'

// Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO — J = segmento, TR = tribunal.
const trt2 = '1001538-51.2018.5.02.0401'
const tst = '1000123-45.2024.5.00.0000'
const civel = '1000123-45.2024.8.26.0100'

describe('parseCnjNumber', () => {
  it('lê segmento e tribunal do número formatado', () => {
    expect(parseCnjNumber(trt2)).toEqual({
      digits: '10015385120185020401',
      segment: '5',
      tribunal: '02',
    })
  })

  it('recusa número com quantidade de dígitos diferente de 20', () => {
    expect(parseCnjNumber('123')).toBeNull()
  })
})

describe('datajudAliasFor', () => {
  it('mapeia TRT para o índice da região, sem o zero à esquerda', () => {
    expect(datajudAliasFor(trt2)).toBe('api_publica_trt2')
  })

  it('mapeia tribunal 00 para o índice do TST', () => {
    // Antes isto virava `api_publica_trt0`, alias inexistente: o DataJud
    // respondia 404 e a sincronização falhava para todo processo no TST.
    expect(datajudAliasFor(tst)).toBe('api_publica_tst')
  })

  it('ignora processo de outro segmento da Justiça', () => {
    expect(datajudAliasFor(civel)).toBeNull()
  })

  it('ignora região fora da faixa de 1 a 24', () => {
    expect(datajudAliasFor('1000123-45.2024.5.99.0000')).toBeNull()
  })
})
