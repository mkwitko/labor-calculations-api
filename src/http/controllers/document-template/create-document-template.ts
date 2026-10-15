import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireOrganizationId } from '@/lib/tenant-context'

export const createDocumentTemplate: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/document-templates',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'Create a custom document template',
        operationId: 'createDocumentTemplate',
        body: z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          type: z
            .enum([
              'parecer_tecnico',
              'peticao_inicial',
              'proposta_acordo',
              'notificacao_extrajudicial',
              'customizado',
            ])
            .default('customizado'),
        }),
        response: {
          201: z.object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
            uploadUrl: z.string().nullable(),
            fileKey: z.string().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const { name, description, type } = request.body

      const template = await prisma.documentTemplate.create({
        data: {
          userId,
          organizationId: requireOrganizationId(),
          name,
          description: description ?? null,
          type,
          isSystem: false,
        },
        select: {
          id: true,
          name: true,
          type: true,
        },
      })

      return reply.status(201).send({
        ...template,
        uploadUrl: null,
        fileKey: null,
      })
    },
  )
}
