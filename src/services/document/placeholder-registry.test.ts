import { describe, expect, it } from 'vitest'
import {
  buildRenderContext,
  getRequiredPlaceholders,
  getRequiredSources,
  PLACEHOLDER_REGISTRY,
  REQUIRED_PLACEHOLDERS_BY_TYPE,
  VALID_PLACEHOLDERS,
} from './placeholder-registry'

describe('placeholder-registry', () => {
  it('has unique keys', () => {
    const keys = PLACEHOLDER_REGISTRY.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every required placeholder exists in the registry', () => {
    for (const [type, required] of Object.entries(
      REQUIRED_PLACEHOLDERS_BY_TYPE,
    )) {
      for (const key of required) {
        expect(VALID_PLACEHOLDERS.has(key), `${type} → ${key}`).toBe(true)
      }
    }
  })

  it('resolves calculation money fields with pt-BR formatting', () => {
    const ctx = buildRenderContext({
      calculation: {
        clientName: 'Fulano',
        clientDocument: '111',
        calculationVersion: 'v3',
        totalValue: 1234.5,
        terminationType: 'sem_justa_causa',
      },
    })
    expect(ctx.clientName).toBe('Fulano')
    expect(ctx.totalValue).toBe('1.234,50')
    expect(ctx.terminationType).toBe('Rescisão sem justa causa')
    expect(ctx.isV3).toBe('Sim')
  })

  it('prefers client entity over denormalized calc fields', () => {
    const ctx = buildRenderContext({
      calculation: { clientName: 'Denormalizado', clientDocument: 'x' },
      client: { name: 'Cliente Real', document: '222' },
    })
    expect(ctx.clientName).toBe('Cliente Real')
    expect(ctx.clientDocument).toBe('222')
  })

  it('resolves case fields when case present, empty otherwise', () => {
    const withCase = buildRenderContext({
      case: { title: 'Caso X', processNumber: '123', phase: 'execucao' },
    })
    expect(withCase.caseTitle).toBe('Caso X')
    expect(withCase.processNumber).toBe('123')
    expect(withCase.casePhase).toBe('Execução')

    const noCase = buildRenderContext({ calculation: {} })
    expect(noCase.caseTitle).toBe('')
  })

  it('derives required sources per document type', () => {
    // contestacao does not require lawyerOfficeName → no missing-source noise,
    // but requires calculation-based fields
    const sources = getRequiredSources('peticao_inicial')
    expect(sources).toContain('client')
    expect(sources).toContain('calculation')
    expect(sources).toContain('lawyer')
  })

  it('falls back to customizado required set for unknown types', () => {
    expect(getRequiredPlaceholders('tipo_inexistente')).toEqual(
      REQUIRED_PLACEHOLDERS_BY_TYPE.customizado,
    )
  })
})
