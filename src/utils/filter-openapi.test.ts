import { describe, expect, it } from 'vitest'
import { filterOpenApiToV1 } from './filter-openapi'

const SPEC = {
  openapi: '3.0.3',
  info: { title: 'Labor Calculations API', version: '2.0.0' },
  paths: {
    '/v1/calculations/liquidacao': {
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CalcInput' },
            },
          },
        },
      },
    },
    '/api-keys': {
      get: {
        responses: {
          200: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/InternalKey' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      CalcInput: {
        type: 'object',
        properties: { verba: { $ref: '#/components/schemas/Verba' } },
      },
      // Referenciado só por CalcInput: prova que o filtro caminha em cadeia.
      Verba: { type: 'object' },
      InternalKey: { type: 'object' },
    },
    securitySchemes: {
      ApiKeyAuth: { type: 'http', scheme: 'bearer' },
      BearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
}

describe('filterOpenApiToV1', () => {
  it('mantém só os paths da API pública', () => {
    const filtered = filterOpenApiToV1(SPEC)

    expect(Object.keys(filtered.paths ?? {})).toEqual([
      '/v1/calculations/liquidacao',
    ])
  })

  it('leva os schemas referenciados, inclusive em cadeia', () => {
    const filtered = filterOpenApiToV1(SPEC)
    const schemas = filtered.components?.schemas ?? {}

    // Sem o passo transitivo a spec quebra no primeiro $ref órfão.
    expect(Object.keys(schemas).sort()).toEqual(['CalcInput', 'Verba'])
  })

  it('não vaza schema de rota interna', () => {
    const filtered = filterOpenApiToV1(SPEC)

    expect(filtered.components?.schemas?.InternalKey).toBeUndefined()
  })

  it('mantém só o esquema de segurança da API pública', () => {
    const filtered = filterOpenApiToV1(SPEC)

    expect(filtered.components?.securitySchemes).toEqual({
      ApiKeyAuth: { type: 'http', scheme: 'bearer' },
    })
  })

  it('troca o título interno pelo público', () => {
    const filtered = filterOpenApiToV1(SPEC)

    expect(filtered.info?.title).toBe('LexLaboral | API pública')
  })

  it('spec sem paths não explode', () => {
    expect(filterOpenApiToV1({}).paths).toEqual({})
  })
})
