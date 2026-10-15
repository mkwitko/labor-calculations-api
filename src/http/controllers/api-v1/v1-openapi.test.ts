import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '@/app'

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('spec da API pública', () => {
  it('declara o esquema de chave de API', () => {
    const spec = app.swagger() as {
      components?: { securitySchemes?: Record<string, unknown> }
    }

    expect(spec.components?.securitySchemes?.ApiKeyAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })

  it('cada operação de /v1 diz como se autenticar', () => {
    const spec = app.swagger() as {
      paths: Record<string, Record<string, { security?: unknown[] }>>
    }

    // Sem isto a referência mostra endpoint sem cadeado e quem integra não
    // descobre o header lendo a documentação.
    expect(spec.paths['/v1/calculations/liquidacao'].post.security).toEqual([
      { ApiKeyAuth: [] },
    ])
    expect(spec.paths['/v1/calculations/{id}'].get.security).toEqual([
      { ApiKeyAuth: [] },
    ])
  })
})

describe('explicação dos endpoints públicos', () => {
  type Operation = {
    description?: string
    requestBody?: {
      content: Record<
        string,
        { schema: { properties?: Record<string, { description?: string }> } }
      >
    }
    responses?: Record<string, { description?: string }>
  }

  function operations(): Operation[] {
    const spec = app.swagger() as {
      paths: Record<string, Record<string, Operation>>
    }

    return [
      spec.paths['/v1/calculations/liquidacao'].post,
      spec.paths['/v1/calculations/{id}'].get,
    ]
  }

  it('cada endpoint explica o que faz, o que cobra e o limite', () => {
    for (const operation of operations()) {
      const description = operation.description ?? ''

      expect(description.length).toBeGreaterThan(120)
      expect(description).toMatch(/[Cc]obran/)
      expect(description).toMatch(/60 chamadas por minuto/)
    }
  })

  it('cada resposta tem descrição própria, não "Default Response"', () => {
    for (const operation of operations()) {
      const responses = Object.entries(operation.responses ?? {})

      expect(responses.length).toBeGreaterThan(1)

      for (const [status, response] of responses) {
        expect(
          response.description,
          `resposta ${status} sem descrição`,
        ).toBeTruthy()
        expect(response.description).not.toBe('Default Response')
      }
    }
  })

  it('todo campo do corpo tem descrição', () => {
    const body = operations()[0].requestBody?.content['application/json'].schema
    const properties = Object.entries(body?.properties ?? {})

    expect(properties.length).toBeGreaterThan(20)

    // Campo sem descrição é campo que o integrador vai preencher no chute.
    const semDescricao = properties
      .filter(([, field]) => !field.description)
      .map(([name]) => name)

    expect(semDescricao).toEqual([])
  })

  it('avisa que vacationCount e unpaid13ths não mudam o resultado do V3', () => {
    const body = operations()[0].requestBody?.content['application/json'].schema
    const properties = body?.properties ?? {}

    // Foi o que mais confundiria quem integra: campo obrigatório e inerte.
    expect(properties.vacationCount?.description).toMatch(/sem efeito/i)
    expect(properties.unpaid13ths?.description).toMatch(/sem efeito/i)
  })
})

describe('GET /openapi/v1.json', () => {
  it('responde sem autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/openapi/v1.json',
    })

    expect(response.statusCode).toBe(200)
  })

  it('não expõe path fora de /v1', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/openapi/v1.json',
    })

    const paths = Object.keys(response.json().paths)

    expect(paths.length).toBeGreaterThan(0)
    expect(paths.every((path) => path.startsWith('/v1'))).toBe(true)
  })

  it('todo $ref da spec resolve dentro dela mesma', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/openapi/v1.json',
    })

    const spec = response.json()
    const refs = JSON.stringify(spec).match(/"#\/components\/schemas\/[^"]+"/g)

    for (const ref of refs ?? []) {
      const name = ref.replaceAll('"', '').split('/').pop() as string

      expect(spec.components.schemas[name]).toBeDefined()
    }
  })
})
