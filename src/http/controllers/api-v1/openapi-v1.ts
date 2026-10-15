import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { filterOpenApiToV1, type OpenApiDocument } from '@/utils/filter-openapi'

/**
 * A spec da API pública, servida sem autenticação: documentação atrás de login
 * não serve ao fornecedor de ERP, que integra antes de ter conta no produto.
 *
 * `hide: true` mantém esta rota fora da própria spec — ela descreve a API, não
 * faz parte dela.
 */
export const openapiV1: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/openapi/v1.json',
    { schema: { hide: true } },
    async (_request, reply) => {
      const full = app.swagger() as OpenApiDocument

      return reply.status(200).send(filterOpenApiToV1(full))
    },
  )
}
