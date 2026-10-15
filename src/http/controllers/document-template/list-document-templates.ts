import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'

export const listDocumentTemplates: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/document-templates',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'List document templates for the authenticated user',
        operationId: 'listDocumentTemplates',
        querystring: z.object({
          type: z
            .enum([
              'parecer_tecnico',
              'peticao_inicial',
              'proposta_acordo',
              'notificacao_extrajudicial',
              'danos_morais',
              'aviso_previo_indenizado',
              'horas_extras_adicionais',
              'fgts_e_multa',
              'recurso_ordinario',
              'contestacao',
              'rescisao_indireta',
              'termo_quitacao',
              'customizado',
            ])
            .optional(),
        }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string().nullable(),
              type: z.string(),
              isSystem: z.boolean(),
              fileKey: z.string().nullable(),
              createdAt: z.date(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { type } = request.query

      const templates = await prisma.documentTemplate.findMany({
        where: {
          ...(type ? { type } : {}),
        },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          isSystem: true,
          fileKey: true,
          createdAt: true,
        },
      })

      return reply.status(200).send(templates)
    },
  )
}
