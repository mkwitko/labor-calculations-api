/**
 * A spec interna descreve o app inteiro; a pública descreve dois endpoints.
 *
 * Filtrar path é a parte fácil. O que quebra é o `$ref`: um corpo de requisição
 * aponta para `components.schemas`, que aponta para outro schema, e copiar só o
 * primeiro nível deixa referência órfã — a referência renderiza em branco e quem
 * integra não descobre o formato do corpo.
 */

const PUBLIC_PREFIX = '/v1'

export type OpenApiDocument = {
  openapi?: string
  info?: { title?: string; version?: string }
  paths?: Record<string, unknown>
  components?: {
    schemas?: Record<string, unknown>
    securitySchemes?: Record<string, unknown>
  }
}

/** Nomes de `#/components/schemas/X` alcançáveis a partir de `node`. */
function collectRefs(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found)

    return
  }

  if (!node || typeof node !== 'object') return

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string') {
      const name = value.split('/').pop()

      if (name) found.add(name)

      continue
    }

    collectRefs(value, found)
  }
}

export function filterOpenApiToV1(spec: OpenApiDocument): OpenApiDocument {
  const paths = Object.fromEntries(
    Object.entries(spec.paths ?? {}).filter(([path]) =>
      path.startsWith(PUBLIC_PREFIX),
    ),
  )

  const schemas = spec.components?.schemas ?? {}
  const wanted = new Set<string>()

  collectRefs(paths, wanted)

  // Ponto fixo: schema mantido pode referenciar outro, e aquele mais outro.
  let previous = -1

  while (previous !== wanted.size) {
    previous = wanted.size

    for (const name of [...wanted]) collectRefs(schemas[name], wanted)
  }

  const apiKeyAuth = spec.components?.securitySchemes?.ApiKeyAuth

  return {
    openapi: spec.openapi,
    info: { title: 'LexLaboral | API pública', version: '1.0.0' },
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(schemas).filter(([name]) => wanted.has(name)),
      ),
      securitySchemes: apiKeyAuth ? { ApiKeyAuth: apiKeyAuth } : {},
    },
  }
}
